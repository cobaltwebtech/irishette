import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	externalEvents,
	icalFeeds,
	icalSyncChanges,
	icalSyncLog,
	room,
} from '@/db/schema-export';
import { icalExportPath } from '@/lib/ical-export';
import { parseIcal } from '@/lib/ical-parse';
import { syncFeed, syncRoomFeeds } from '@/lib/ical-sync';
import { newIcalExportToken } from '@/lib/ids';
import {
	createIcalFeedSchema,
	roomIdSchema,
	testIcalUrlSchema,
	updateIcalFeedSchema,
} from '@/lib/room-validation';

import { adminProcedure, createTRPCRouter } from './init';

// Admin-only iCal management: import feeds (URLs are third-party secrets and
// only ever returned here), sync history, and the export URL/token.

async function requireRoom(db: Database, roomId: string) {
	const [row] = await db
		.select({
			id: room.id,
			publicId: room.publicId,
			token: room.icalExportToken,
		})
		.from(room)
		.where(eq(room.id, roomId));
	if (!row)
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
	return row;
}

async function requireFeed(db: Database, id: string) {
	const [feed] = await db.select().from(icalFeeds).where(eq(icalFeeds.id, id));
	if (!feed)
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed not found' });
	return feed;
}

const isUniqueViolation = (error: unknown) =>
	error instanceof Error &&
	/UNIQUE constraint failed/i.test(
		`${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`,
	);

const duplicateFeed = () =>
	new TRPCError({
		code: 'CONFLICT',
		message: 'This room already has a feed with that URL',
	});

export const icalRouter = createTRPCRouter({
	listFeeds: adminProcedure
		.input(roomIdSchema)
		.query(async ({ ctx, input }) => {
			const feeds = await ctx.db
				.select({
					feed: icalFeeds,
					events: sql<number>`(SELECT count(*) FROM ${externalEvents} WHERE ${externalEvents.feedId} = ${icalFeeds.id})`,
				})
				.from(icalFeeds)
				.where(eq(icalFeeds.roomId, input.roomId))
				.orderBy(icalFeeds.createdAt);
			return feeds.map(({ feed, events }) => ({
				id: feed.id,
				source: feed.source,
				label: feed.label,
				url: feed.url,
				isActive: feed.isActive,
				lastSuccessAt: feed.lastSuccessAt,
				lastAttemptAt: feed.lastAttemptAt,
				lastEventCount: feed.lastEventCount,
				lastError: feed.lastError,
				storedEvents: events,
				createdAt: feed.createdAt,
			}));
		}),

	createFeed: adminProcedure
		.input(createIcalFeedSchema)
		.mutation(async ({ ctx, input }) => {
			await requireRoom(ctx.db, input.roomId);
			try {
				const [feed] = await ctx.db
					.insert(icalFeeds)
					.values({
						roomId: input.roomId,
						source: input.source,
						label: input.label || null,
						url: input.url,
						isActive: input.isActive,
					})
					.returning({ id: icalFeeds.id });
				return feed;
			} catch (error) {
				if (isUniqueViolation(error)) throw duplicateFeed();
				throw error;
			}
		}),

	/** Changing the URL resets the sync state (etag, counts). */
	updateFeed: adminProcedure
		.input(updateIcalFeedSchema)
		.mutation(async ({ ctx, input }) => {
			const current = await requireFeed(ctx.db, input.id);
			const urlChanged = input.url !== undefined && input.url !== current.url;
			try {
				await ctx.db
					.update(icalFeeds)
					.set({
						...(input.source ? { source: input.source } : {}),
						...(input.label !== undefined
							? { label: input.label || null }
							: {}),
						...(input.url ? { url: input.url } : {}),
						...(input.isActive !== undefined
							? { isActive: input.isActive }
							: {}),
						...(urlChanged
							? {
									etag: null,
									lastModified: null,
									lastEventCount: null,
									lastError: null,
								}
							: {}),
						updatedAt: new Date(),
					})
					.where(eq(icalFeeds.id, input.id));
			} catch (error) {
				if (isUniqueViolation(error)) throw duplicateFeed();
				throw error;
			}
			return { success: true };
		}),

	/** Deletes the feed and the events imported from it. */
	deleteFeed: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			await requireFeed(ctx.db, input.id);
			await ctx.db.delete(icalFeeds).where(eq(icalFeeds.id, input.id));
			return { success: true };
		}),

	/** Fetches a URL and reports whether it is a usable iCal feed. */
	testUrl: adminProcedure
		.input(testIcalUrlSchema)
		.mutation(async ({ input }) => {
			try {
				const response = await fetch(input.url, {
					headers: { 'User-Agent': 'Irishette Calendar Test/2.0' },
					signal: AbortSignal.timeout(10_000),
				});
				if (!response.ok) {
					await response.body?.cancel();
					return { success: false as const, error: `HTTP ${response.status}` };
				}
				const parsed = parseIcal(await response.text());
				if (!parsed.isCalendar) {
					return {
						success: false as const,
						error: 'The URL did not return an iCalendar feed',
					};
				}
				return {
					success: true as const,
					eventCount: parsed.events.length,
					reserved: parsed.events.filter((e) => e.kind === 'reserved').length,
					unavailable: parsed.events.filter((e) => e.kind === 'unavailable')
						.length,
				};
			} catch (error) {
				return {
					success: false as const,
					error:
						error instanceof Error && error.name === 'TimeoutError'
							? 'The feed did not respond within 10 seconds'
							: 'The feed could not be fetched',
				};
			}
		}),

	/** "Sync now" for a room. `force` applies a feed that failed validation. */
	syncRoom: adminProcedure
		.input(roomIdSchema.extend({ force: z.boolean().default(false) }))
		.mutation(async ({ ctx, input }) => {
			await requireRoom(ctx.db, input.roomId);
			return syncRoomFeeds(ctx, input.roomId, {
				trigger: 'manual',
				force: input.force,
			});
		}),

	syncFeed: adminProcedure
		.input(
			z.object({ id: z.string().min(1), force: z.boolean().default(false) }),
		)
		.mutation(async ({ ctx, input }) => {
			const feed = await requireFeed(ctx.db, input.id);
			return syncFeed(ctx, feed, { trigger: 'manual', force: input.force });
		}),

	/** Sync runs, newest first. */
	getSyncLogs: adminProcedure
		.input(
			z.object({
				roomId: z.string().optional(),
				feedId: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions = [];
			if (input.roomId) conditions.push(eq(icalSyncLog.roomId, input.roomId));
			if (input.feedId) conditions.push(eq(icalSyncLog.feedId, input.feedId));
			const logs = await ctx.db
				.select({
					log: icalSyncLog,
					feedLabel: icalFeeds.label,
				})
				.from(icalSyncLog)
				.leftJoin(icalFeeds, eq(icalSyncLog.feedId, icalFeeds.id))
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(desc(icalSyncLog.createdAt), desc(icalSyncLog.id))
				.limit(input.limit);
			return {
				logs: logs.map(({ log, feedLabel }) => ({ ...log, feedLabel })),
				totalLogs: logs.length,
			};
		}),

	/** What one sync run changed (with the overlapping booking for conflicts). */
	getSyncChanges: adminProcedure
		.input(z.object({ syncLogId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					change: icalSyncChanges,
					booking: {
						publicId: bookings.publicId,
						confirmationId: bookings.confirmationId,
					},
				})
				.from(icalSyncChanges)
				.leftJoin(bookings, eq(icalSyncChanges.bookingId, bookings.id))
				.where(eq(icalSyncChanges.syncLogId, input.syncLogId))
				.orderBy(icalSyncChanges.action, icalSyncChanges.startDate);
		}),

	/** The room's export feed URL (contains the secret token). */
	getExportUrl: adminProcedure
		.input(roomIdSchema)
		.query(async ({ ctx, input }) => {
			const r = await requireRoom(ctx.db, input.roomId);
			return {
				url: `${ctx.env.BETTER_AUTH_URL}${icalExportPath(r.publicId, r.token)}`,
			};
		}),

	/** New export token: the old URL stops working (reconnect the platforms). */
	regenerateExportToken: adminProcedure
		.input(roomIdSchema)
		.mutation(async ({ ctx, input }) => {
			const r = await requireRoom(ctx.db, input.roomId);
			const token = newIcalExportToken();
			await ctx.db
				.update(room)
				.set({ icalExportToken: token, updatedAt: new Date() })
				.where(eq(room.id, input.roomId));
			return {
				url: `${ctx.env.BETTER_AUTH_URL}${icalExportPath(r.publicId, token)}`,
			};
		}),
});
