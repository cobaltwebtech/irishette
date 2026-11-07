import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import {
	bookings,
	externalEvents,
	type IcalSyncStatus,
	icalFeeds,
	icalSyncChanges,
	icalSyncLog,
	room,
} from '@/db/schema-export';

import { holdsDatesCondition } from './availability';
import { stayOverlapsEvent } from './date-range';
import type { ServiceDeps } from './deps';
import { sendAdminAlert } from './email-service';
import { type ImportedEvent, parseIcal } from './ical-parse';
import { newId } from './ids';
import { todayIn } from './timezone';

// Import sync for iCal feeds (plan 7b). One run per feed:
// 1. Conditional GET with a timeout. 304 → nothing to do.
// 2. Validate: HTTP 200, a VCALENDAR, and no sudden drop in events. A failed
//    check leaves stored events untouched, records the error on the feed and
//    alerts the admins (once, when a healthy feed starts failing).
// 3. Diff against stored events by (feed, UID) and apply inserts, updates and
//    deletes, the run log and the per-event change log in ONE D1 batch (a
//    transaction: all or nothing).
// 4. Email the admins about new/changed events that overlap our bookings.

export type SyncTrigger = 'cron' | 'manual' | 'checkout';

export interface SyncOptions {
	trigger: SyncTrigger;
	/** Fetch timeout. */
	timeoutMs?: number;
	/** Apply even if validation would reject a drop in events (admin). */
	force?: boolean;
	now?: Date;
}

export interface SyncResult {
	feedId: string;
	roomId: string;
	status: IcalSyncStatus;
	added: number;
	updated: number;
	removed: number;
	conflicts: number;
	error: string | null;
}

type Feed = typeof icalFeeds.$inferSelect;

const USER_AGENT = 'Irishette Calendar Sync/2.0 (+https://irishette.com)';
const DEFAULT_TIMEOUT_MS = 10_000;
/** Feeds synced this recently are skipped by the pre-payment sync. */
const CHECKOUT_FRESH_MS = 2 * 60_000;
/** D1 allows 100 bound parameters per statement. */
const MAX_PARAMS = 100;

/** Validation: refuse to apply a feed whose event count collapsed. */
function suspiciousDrop(
	previousCount: number | null,
	newCount: number,
): string | null {
	if (previousCount === null || previousCount === 0) return null;
	if (newCount === 0) {
		return `Feed returned no events (previously ${previousCount})`;
	}
	if (previousCount >= 4 && newCount < previousCount / 2) {
		return `Feed events dropped from ${previousCount} to ${newCount}`;
	}
	return null;
}

function chunk<T>(rows: T[], columns: number): T[][] {
	const size = Math.max(1, Math.floor(MAX_PARAMS / columns));
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
	return out;
}

const shortError = (error: unknown) =>
	(error instanceof Error ? error.message : String(error)).slice(0, 300);

export async function syncFeed(
	deps: ServiceDeps,
	feed: Feed,
	options: SyncOptions,
): Promise<SyncResult> {
	const { db } = deps;
	const now = options.now ?? new Date();
	const started = Date.now();
	const result: SyncResult = {
		feedId: feed.id,
		roomId: feed.roomId,
		status: 'error',
		added: 0,
		updated: 0,
		removed: 0,
		conflicts: 0,
		error: null,
	};

	/** Records a run that did not apply anything. */
	const recordFailure = async (
		status: 'error' | 'rejected',
		message: string,
		httpStatus: number | null,
		eventsInFeed: number | null,
	) => {
		result.status = status;
		result.error = message;
		await db.batch([
			db
				.update(icalFeeds)
				.set({ lastAttemptAt: now, lastError: message, updatedAt: now })
				.where(eq(icalFeeds.id, feed.id)),
			db.insert(icalSyncLog).values({
				roomId: feed.roomId,
				feedId: feed.id,
				platform: feed.source,
				trigger: options.trigger,
				status,
				httpStatus,
				eventsInFeed,
				errorMessage: message,
				syncDuration: Date.now() - started,
				createdAt: now,
			}),
		]);
		console.error(
			`iCal sync ${feed.source} feed ${feed.id} ${status}: ${message}`,
		);
		// Alert once, when a healthy feed starts failing.
		if (!feed.lastError) {
			await alertFeedProblem(deps, feed, message).catch((e: unknown) =>
				console.error('iCal sync alert failed:', shortError(e)),
			);
		}
		return result;
	};

	// 1. Fetch
	let response: Response;
	try {
		const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
		if (feed.etag) headers['If-None-Match'] = feed.etag;
		if (feed.lastModified) headers['If-Modified-Since'] = feed.lastModified;
		response = await fetch(feed.url, {
			headers,
			signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
			redirect: 'follow',
		});
	} catch (error) {
		return recordFailure(
			'error',
			`Fetch failed: ${shortError(error)}`,
			null,
			null,
		);
	}

	if (response.status === 304) {
		result.status = 'not_modified';
		await db.batch([
			db
				.update(icalFeeds)
				.set({
					lastAttemptAt: now,
					lastSuccessAt: now,
					lastError: null,
					updatedAt: now,
				})
				.where(eq(icalFeeds.id, feed.id)),
			db.insert(icalSyncLog).values({
				roomId: feed.roomId,
				feedId: feed.id,
				platform: feed.source,
				trigger: options.trigger,
				status: 'not_modified',
				httpStatus: 304,
				eventsInFeed: feed.lastEventCount,
				syncDuration: Date.now() - started,
				createdAt: now,
			}),
		]);
		return result;
	}
	if (!response.ok) {
		await response.body?.cancel();
		return recordFailure(
			'error',
			`HTTP ${response.status}`,
			response.status,
			null,
		);
	}

	// 2. Parse and validate
	let text: string;
	try {
		text = await response.text();
	} catch (error) {
		return recordFailure(
			'error',
			`Read failed: ${shortError(error)}`,
			response.status,
			null,
		);
	}
	const parsed = parseIcal(text);
	if (!parsed.isCalendar) {
		return recordFailure(
			'rejected',
			'Response is not an iCalendar feed',
			response.status,
			null,
		);
	}
	const count = parsed.events.length;
	const drop = suspiciousDrop(feed.lastEventCount, count);
	if (drop && !options.force) {
		return recordFailure('rejected', drop, response.status, count);
	}

	// 3. Diff (events that already ended are not kept)
	const today = todayIn(undefined, now);
	const desired = new Map<string, ImportedEvent>(
		parsed.events.filter((e) => e.end > today).map((e) => [e.uid, e]),
	);
	const stored = await db
		.select()
		.from(externalEvents)
		.where(eq(externalEvents.feedId, feed.id));
	const storedByUid = new Map(stored.map((s) => [s.uid, s]));

	const toInsert: ImportedEvent[] = [];
	const toUpdate: Array<{
		id: string;
		event: ImportedEvent;
		before: (typeof stored)[number];
	}> = [];
	for (const event of desired.values()) {
		const existing = storedByUid.get(event.uid);
		if (!existing) toInsert.push(event);
		else if (
			existing.startDate !== event.start ||
			existing.endDate !== event.end ||
			existing.kind !== event.kind
		) {
			toUpdate.push({ id: existing.id, event, before: existing });
		}
	}
	const toRemove = stored.filter((s) => !desired.has(s.uid));

	// Conflicts: new or changed events over our bookings and live holds.
	const changed = [...toInsert, ...toUpdate.map((u) => u.event)];
	const conflicts = await findEventConflicts(deps, feed.roomId, changed, now);

	const syncLogId = newId();
	const changeRows = [
		...toInsert.map((e) => ({
			action: 'added' as const,
			uid: e.uid,
			kind: e.kind,
			startDate: e.start,
			endDate: e.end,
		})),
		...toUpdate.map((u) => ({
			action: 'updated' as const,
			uid: u.event.uid,
			kind: u.event.kind,
			startDate: u.event.start,
			endDate: u.event.end,
			previousStartDate: u.before.startDate,
			previousEndDate: u.before.endDate,
		})),
		...toRemove.map((s) => ({
			action: 'removed' as const,
			uid: s.uid,
			kind: s.kind,
			previousStartDate: s.startDate,
			previousEndDate: s.endDate,
		})),
		...conflicts.map((c) => ({
			action: 'conflict' as const,
			uid: c.event.uid,
			kind: c.event.kind,
			startDate: c.event.start,
			endDate: c.event.end,
			bookingId: c.booking.id,
		})),
	].map((row) => ({
		syncLogId,
		roomId: feed.roomId,
		feedId: feed.id,
		createdAt: now,
		...row,
	}));

	const statements: BatchItem<'sqlite'>[] = [
		db.insert(icalSyncLog).values({
			id: syncLogId,
			roomId: feed.roomId,
			feedId: feed.id,
			platform: feed.source,
			trigger: options.trigger,
			status: 'success',
			httpStatus: response.status,
			eventsInFeed: count,
			added: toInsert.length,
			updated: toUpdate.length,
			removed: toRemove.length,
			conflicts: conflicts.length,
			syncDuration: Date.now() - started,
			createdAt: now,
		}),
	];
	for (const rows of chunk(toInsert, 11)) {
		statements.push(
			db.insert(externalEvents).values(
				rows.map((e) => ({
					feedId: feed.id,
					roomId: feed.roomId,
					uid: e.uid,
					startDate: e.start,
					endDate: e.end,
					kind: e.kind,
					summary: e.summary?.slice(0, 200) ?? null,
					lastSeenAt: now,
					createdAt: now,
					updatedAt: now,
				})),
			),
		);
	}
	for (const u of toUpdate) {
		statements.push(
			db
				.update(externalEvents)
				.set({
					startDate: u.event.start,
					endDate: u.event.end,
					kind: u.event.kind,
					summary: u.event.summary?.slice(0, 200) ?? null,
					lastSeenAt: now,
					updatedAt: now,
				})
				.where(eq(externalEvents.id, u.id)),
		);
	}
	for (const ids of chunk(
		toRemove.map((s) => s.id),
		1,
	)) {
		statements.push(
			db.delete(externalEvents).where(inArray(externalEvents.id, ids)),
		);
	}
	for (const rows of chunk(changeRows, 13)) {
		statements.push(db.insert(icalSyncChanges).values(rows));
	}
	statements.push(
		db
			.update(icalFeeds)
			.set({
				etag: response.headers.get('etag'),
				lastModified: response.headers.get('last-modified'),
				lastAttemptAt: now,
				lastSuccessAt: now,
				lastEventCount: count,
				lastError: null,
				updatedAt: now,
			})
			.where(eq(icalFeeds.id, feed.id)),
	);

	try {
		await db.batch(
			statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
		);
	} catch (error) {
		// The batch is one transaction: nothing above was written.
		return recordFailure(
			'error',
			`Write failed: ${shortError(error)}`,
			response.status,
			count,
		);
	}

	result.status = 'success';
	result.added = toInsert.length;
	result.updated = toUpdate.length;
	result.removed = toRemove.length;
	result.conflicts = conflicts.length;

	if (conflicts.length > 0) {
		await alertConflicts(deps, feed, conflicts).catch((e: unknown) =>
			console.error('iCal conflict alert failed:', shortError(e)),
		);
	}
	return result;
}

async function findEventConflicts(
	{ db }: ServiceDeps,
	roomId: string,
	events: ImportedEvent[],
	now: Date,
) {
	if (events.length === 0) return [];
	// YYYY-MM-DD strings sort chronologically.
	const from = events.map((e) => e.start).sort()[0];
	const to = events
		.map((e) => e.end)
		.sort()
		.at(-1) as string;
	const candidates = await db
		.select({
			id: bookings.id,
			publicId: bookings.publicId,
			confirmationId: bookings.confirmationId,
			guestName: bookings.guestName,
			checkInDate: bookings.checkInDate,
			checkOutDate: bookings.checkOutDate,
			status: bookings.status,
		})
		.from(bookings)
		.where(
			and(
				eq(bookings.roomId, roomId),
				holdsDatesCondition(now),
				lt(bookings.checkInDate, to),
				gt(bookings.checkOutDate, from),
			),
		);
	return events.flatMap((event) =>
		candidates
			.filter((b) =>
				stayOverlapsEvent(
					{ checkIn: b.checkInDate, checkOut: b.checkOutDate },
					event,
				),
			)
			.map((booking) => ({ event, booking })),
	);
}

async function roomLabel(deps: ServiceDeps, roomId: string) {
	const [row] = await deps.db
		.select({ name: room.name, publicId: room.publicId })
		.from(room)
		.where(eq(room.id, roomId));
	return row ?? { name: 'Room', publicId: '' };
}

async function alertFeedProblem(
	deps: ServiceDeps,
	feed: Feed,
	message: string,
) {
	const r = await roomLabel(deps, feed.roomId);
	await sendAdminAlert(deps.db, deps.env, {
		subject: `Calendar sync problem: ${r.name} (${feed.source})`,
		heading: 'A calendar feed stopped syncing',
		paragraphs: [
			'The latest import was not applied, so the stored reservations from this feed were left unchanged. Check the feed URL on the platform and use "Sync now" once it is fixed.',
		],
		details: [
			{ label: 'Room', value: r.name },
			{ label: 'Feed', value: feed.label ?? feed.source },
			{ label: 'Problem', value: message },
		],
		link: {
			label: 'Open calendar settings',
			path: `/admin/property-management/${r.publicId}`,
		},
	});
}

async function alertConflicts(
	deps: ServiceDeps,
	feed: Feed,
	conflicts: Awaited<ReturnType<typeof findEventConflicts>>,
) {
	const r = await roomLabel(deps, feed.roomId);
	await sendAdminAlert(deps.db, deps.env, {
		subject: `Double booking: ${r.name} (${feed.source})`,
		heading: 'An imported reservation overlaps a booking',
		paragraphs: [
			`A reservation imported from ${feed.label ?? feed.source} overlaps ${conflicts.length === 1 ? 'a booking' : 'bookings'} made on this site. Resolve it on the platform or with the guest.`,
			...conflicts.map(
				(c) =>
					`${feed.source} ${c.event.start} to ${c.event.end} overlaps ${c.booking.confirmationId} (${c.booking.guestName}, ${c.booking.checkInDate} to ${c.booking.checkOutDate}, ${c.booking.status}).`,
			),
		],
		details: [{ label: 'Room', value: r.name }],
		link: {
			label: 'Open bookings',
			path: `/admin/bookings/${conflicts[0].booking.publicId}`,
		},
		idempotencyKey: `sync-conflict/${feed.id}/${conflicts
			.map(
				(c) => `${c.booking.id}:${c.event.uid}:${c.event.start}:${c.event.end}`,
			)
			.join(',')}`.slice(0, 256),
	});
}

async function activeFeeds(deps: ServiceDeps, roomId?: string) {
	return deps.db
		.select()
		.from(icalFeeds)
		.where(
			roomId
				? and(eq(icalFeeds.isActive, true), eq(icalFeeds.roomId, roomId))
				: eq(icalFeeds.isActive, true),
		);
}

/** Syncs feeds in parallel; one failing feed never stops the others. */
async function syncFeeds(
	deps: ServiceDeps,
	feeds: Feed[],
	options: SyncOptions,
) {
	const settled = await Promise.allSettled(
		feeds.map((feed) => syncFeed(deps, feed, options)),
	);
	return settled.map((s, i): SyncResult =>
		s.status === 'fulfilled'
			? s.value
			: {
					feedId: feeds[i].id,
					roomId: feeds[i].roomId,
					status: 'error',
					added: 0,
					updated: 0,
					removed: 0,
					conflicts: 0,
					error: shortError(s.reason),
				},
	);
}

/** All active feeds (the every-30-minutes cron). */
export async function syncAllFeeds(deps: ServiceDeps, options: SyncOptions) {
	return syncFeeds(deps, await activeFeeds(deps), options);
}

/**
 * A room's active feeds ("Sync now", and before a PaymentIntent). The
 * pre-payment sync skips feeds attempted in the last two minutes and uses a
 * shorter timeout.
 */
export async function syncRoomFeeds(
	deps: ServiceDeps,
	roomId: string,
	options: SyncOptions,
) {
	const now = options.now ?? new Date();
	let feeds = await activeFeeds(deps, roomId);
	if (options.trigger === 'checkout') {
		feeds = feeds.filter(
			(f) =>
				!f.lastAttemptAt ||
				now.getTime() - f.lastAttemptAt.getTime() > CHECKOUT_FRESH_MS,
		);
	}
	return syncFeeds(deps, feeds, {
		timeoutMs: options.trigger === 'checkout' ? 5_000 : undefined,
		...options,
	});
}
