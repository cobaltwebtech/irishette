import { TRPCError } from '@trpc/server';
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	or,
	type SQL,
	sql,
} from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '@/db/drizzle-init';
import { adminInboxItems, bookings, user } from '@/db/schema-export';
import type { InboxStatus } from '@/lib/inbox/inbox';
import {
	decodeInboxCursor,
	encodeInboxCursor,
	inboxDeleteSchema,
	inboxFiltersSchema,
	inboxListSchema,
	inboxSetStatusSchema,
} from '@/lib/inbox/inbox-validation';
import { publicIdSchema } from '@/utils/ids';

import { adminProcedure, createTRPCRouter } from './init';

// Admin notification inbox (docs/ADMIN_INBOX.md). Admin-only; items are
// addressed by publicId. Status is shared by all admins.

const t = adminInboxItems;

/** Columns for lists (no details JSON). */
const listColumns = {
	publicId: t.publicId,
	source: t.source,
	kind: t.kind,
	title: t.title,
	summary: t.summary,
	status: t.status,
	occurrences: t.occurrences,
	surfacedAt: t.surfacedAt,
	createdAt: t.createdAt,
	booking: {
		publicId: bookings.publicId,
		confirmationId: bookings.confirmationId,
	},
	guest: { publicId: user.publicId, name: user.name },
};

/** LIKE pattern for a literal substring (escapes %, _ and \). */
function containsPattern(text: string) {
	return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function filterConditions(filters: z.infer<typeof inboxFiltersSchema>) {
	const conditions: SQL[] = [
		filters.view === 'inbox'
			? inArray(t.status, ['new', 'read'])
			: eq(t.status, filters.view),
	];
	if (filters.source) conditions.push(eq(t.source, filters.source));
	if (filters.kind) conditions.push(eq(t.kind, filters.kind));
	if (filters.search) {
		const pattern = containsPattern(filters.search);
		conditions.push(
			or(
				sql`${t.title} LIKE ${pattern} ESCAPE '\\'`,
				sql`${t.summary} LIKE ${pattern} ESCAPE '\\'`,
			) as SQL,
		);
	}
	return conditions;
}

/** List query with the booking and guest joined (left: links are optional). */
function listQuery(db: Database) {
	return db
		.select(listColumns)
		.from(t)
		.leftJoin(bookings, eq(t.bookingId, bookings.id))
		.leftJoin(user, eq(t.userId, user.id));
}

/** Rows older than the cursor, or newer ones when going backwards. */
function afterCursor(cursor: string, backwards: boolean) {
	const c = decodeInboxCursor(cursor);
	return backwards
		? sql`(${t.surfacedAt}, ${t.publicId}) > (${c.surfacedAt}, ${c.publicId})`
		: sql`(${t.surfacedAt}, ${t.publicId}) < (${c.surfacedAt}, ${c.publicId})`;
}

/**
 * Drops the extra row fetched to detect another page, restores newest-first
 * order for a backwards page and computes both cursors.
 */
function pageOf<T extends { surfacedAt: Date; publicId: string }>(
	rows: T[],
	input: { pageSize: number; cursor?: string; direction: 'next' | 'prev' },
) {
	const backwards = input.direction === 'prev';
	const more = rows.length > input.pageSize;
	const items = rows.slice(0, input.pageSize);
	if (backwards) items.reverse();
	const first = items[0];
	const last = items.at(-1);
	// Older items exist after `last`; newer ones before `first`.
	const hasOlder = backwards || more;
	const hasNewer = backwards ? more : Boolean(input.cursor);
	return {
		items,
		nextCursor: last && hasOlder ? encodeInboxCursor(last) : null,
		prevCursor: first && hasNewer ? encodeInboxCursor(first) : null,
	};
}

const LINKED_LIST_LIMIT = 20;

export const inboxRouter = createTRPCRouter({
	/**
	 * One page, newest surfaced first, keyset-paginated on
	 * (surfaced_at, public_id). Returns cursors for the pages before and after.
	 */
	adminList: adminProcedure
		.input(inboxListSchema)
		.query(async ({ ctx, input }) => {
			const backwards = input.direction === 'prev';
			const conditions = filterConditions(input);
			if (input.cursor) conditions.push(afterCursor(input.cursor, backwards));
			const order = backwards ? asc : desc;
			const rows = await listQuery(ctx.db)
				.where(and(...conditions))
				.orderBy(order(t.surfacedAt), order(t.publicId))
				.limit(input.pageSize + 1);
			return pageOf(rows, input);
		}),

	/** Total for the current filters (separate so paging does not recount). */
	adminCount: adminProcedure
		.input(inboxFiltersSchema)
		.query(async ({ ctx, input }) => {
			const [{ total }] = await ctx.db
				.select({ total: count() })
				.from(t)
				.where(and(...filterConditions(input)));
			return { total };
		}),

	/** Unread items, for the sidebar badge. */
	adminUnreadCount: adminProcedure.query(async ({ ctx }) => {
		const [{ unread }] = await ctx.db
			.select({ unread: count() })
			.from(t)
			.where(eq(t.status, 'new'));
		return { unread };
	}),

	/** One item with its details and linked booking / guest summaries. */
	adminGet: adminProcedure
		.input(z.object({ publicId: publicIdSchema }))
		.query(async ({ ctx, input }) => {
			const [item] = await ctx.db
				.select({
					publicId: t.publicId,
					source: t.source,
					kind: t.kind,
					title: t.title,
					summary: t.summary,
					details: t.details,
					status: t.status,
					occurrences: t.occurrences,
					readAt: t.readAt,
					archivedAt: t.archivedAt,
					surfacedAt: t.surfacedAt,
					createdAt: t.createdAt,
					updatedAt: t.updatedAt,
					booking: {
						publicId: bookings.publicId,
						confirmationId: bookings.confirmationId,
						guestName: bookings.guestName,
						checkInDate: bookings.checkInDate,
						checkOutDate: bookings.checkOutDate,
						status: bookings.status,
					},
					guest: {
						publicId: user.publicId,
						name: user.name,
						email: user.email,
					},
				})
				.from(t)
				.leftJoin(bookings, eq(t.bookingId, bookings.id))
				.leftJoin(user, eq(t.userId, user.id))
				.where(eq(t.publicId, input.publicId));
			if (!item) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Notification not found',
				});
			}
			return item;
		}),

	/** Marks items new / read / archived, or moves them out of the archive. */
	adminSetStatus: adminProcedure
		.input(inboxSetStatusSchema)
		.mutation(async ({ ctx, input }) => {
			const now = new Date();
			const status: InboxStatus =
				input.status === 'unarchived' ? 'read' : input.status;
			const updated = await ctx.db
				.update(t)
				.set({
					status,
					readAt:
						status === 'new'
							? null
							: sql`COALESCE(${t.readAt}, ${Math.floor(now.getTime() / 1000)})`,
					archivedAt: status === 'archived' ? now : null,
					updatedAt: now,
				})
				.where(inArray(t.publicId, input.publicIds))
				.returning({ publicId: t.publicId });
			return { updated: updated.length };
		}),

	/** Deletes items for good (a dispute record, Phase 3, would stay). */
	adminDelete: adminProcedure
		.input(inboxDeleteSchema)
		.mutation(async ({ ctx, input }) => {
			const deleted = await ctx.db
				.delete(t)
				.where(inArray(t.publicId, input.publicIds))
				.returning({ publicId: t.publicId });
			return { deleted: deleted.length };
		}),

	/** The latest notifications about one booking (admin booking page). */
	adminListForBooking: adminProcedure
		.input(z.object({ bookingPublicId: publicIdSchema }))
		.query(({ ctx, input }) =>
			listQuery(ctx.db)
				.where(eq(bookings.publicId, input.bookingPublicId))
				.orderBy(desc(t.surfacedAt), desc(t.publicId))
				.limit(LINKED_LIST_LIMIT),
		),

	/** The latest notifications about one guest (admin guest page). */
	adminListForUser: adminProcedure
		.input(z.object({ userPublicId: publicIdSchema }))
		.query(({ ctx, input }) =>
			listQuery(ctx.db)
				.where(eq(user.publicId, input.userPublicId))
				.orderBy(desc(t.surfacedAt), desc(t.publicId))
				.limit(LINKED_LIST_LIMIT),
		),
});
