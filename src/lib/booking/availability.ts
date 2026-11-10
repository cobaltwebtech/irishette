import { and, eq, gt, gte, lt, lte, ne, or, type SQL, sql } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	externalEvents,
	icalFeeds,
	roomBlockedPeriods,
} from '@/db/schema-export';
import {
	type IsoDate,
	isStayAvailable,
	type Unavailability,
} from '@/utils/date-range';

// The single availability check (plan 7.2). A stay [checkIn, checkOut) is
// unavailable if it overlaps:
// - a confirmed booking, a pending hold that has not expired, or a pending
//   hold whose (delayed) payment is processing;
// - an imported external event (end exclusive);
// - an admin block (inclusive).
// Used by the calendar, booking creation, Checkout Session creation and (as
// SQL) the guarded confirmation update.

/**
 * How long a hold keeps its dates. The hold's Checkout Session expires at the
 * same moment; Stripe needs at least 30 minutes, so 35 leaves room for clock
 * skew and the time spent creating the session (plan 02, B5).
 */
export const HOLD_MINUTES = 35;

export type ConflictSource = 'direct' | 'block' | (string & {});

export interface Conflict {
	kind: 'booking' | 'hold' | 'external' | 'block';
	/** 'direct' for our bookings, the feed source for imports, 'block'. */
	source: ConflictSource;
	publicId: string | null;
	confirmationId: string | null;
	checkIn: IsoDate;
	/** Exclusive for bookings and imported events; the last day for blocks. */
	checkOut: IsoDate;
	status: string;
	/** Internal id (booking, external event or block). Admin-only. */
	id: string;
	label: string | null;
}

interface RangeOptions {
	excludeBookingId?: string;
	now?: Date;
}

/**
 * Bookings that hold dates: confirmed, pending with a live hold, or pending
 * with a delayed payment processing (kept past the hold expiry, so nobody
 * else can take the dates while a bank payment is pending).
 */
export function holdsDatesCondition(now: Date): SQL | undefined {
	return or(
		eq(bookings.status, 'confirmed'),
		and(
			eq(bookings.status, 'pending'),
			or(gt(bookings.expiresAt, now), eq(bookings.paymentStatus, 'processing')),
		),
	);
}

/**
 * Everything that makes nights in [from, to) unavailable for a room.
 * `to` is exclusive (a check-out date).
 */
export async function loadUnavailability(
	db: Database,
	roomId: string,
	from: IsoDate,
	to: IsoDate,
	{ excludeBookingId, now = new Date() }: RangeOptions = {},
) {
	const bookingConditions = [
		eq(bookings.roomId, roomId),
		holdsDatesCondition(now),
		lt(bookings.checkInDate, to),
		gt(bookings.checkOutDate, from),
	];
	if (excludeBookingId)
		bookingConditions.push(ne(bookings.id, excludeBookingId));

	const [stayRows, eventRows, blockRows] = await Promise.all([
		db
			.select({
				id: bookings.id,
				publicId: bookings.publicId,
				confirmationId: bookings.confirmationId,
				checkIn: bookings.checkInDate,
				checkOut: bookings.checkOutDate,
				status: bookings.status,
			})
			.from(bookings)
			.where(and(...bookingConditions)),
		db
			.select({
				id: externalEvents.id,
				start: externalEvents.startDate,
				end: externalEvents.endDate,
				kind: externalEvents.kind,
				source: icalFeeds.source,
				label: icalFeeds.label,
			})
			.from(externalEvents)
			.innerJoin(icalFeeds, eq(externalEvents.feedId, icalFeeds.id))
			.where(
				and(
					eq(externalEvents.roomId, roomId),
					lt(externalEvents.startDate, to),
					gt(externalEvents.endDate, from),
				),
			),
		db
			.select({
				id: roomBlockedPeriods.id,
				start: roomBlockedPeriods.startDate,
				end: roomBlockedPeriods.endDate,
				reason: roomBlockedPeriods.reason,
			})
			.from(roomBlockedPeriods)
			.where(
				and(
					eq(roomBlockedPeriods.roomId, roomId),
					lt(roomBlockedPeriods.startDate, to),
					gte(roomBlockedPeriods.endDate, from),
				),
			),
	]);

	const unavailability: Unavailability = {
		stays: stayRows.map((s) => ({ checkIn: s.checkIn, checkOut: s.checkOut })),
		events: eventRows.map((e) => ({ start: e.start, end: e.end })),
		blocks: blockRows.map((b) => ({ start: b.start, end: b.end })),
	};
	return { unavailability, stayRows, eventRows, blockRows };
}

/** Is [checkIn, checkOut) free? Returns the conflicts if not. */
export async function checkAvailability(
	db: Database,
	roomId: string,
	checkIn: IsoDate,
	checkOut: IsoDate,
	options: RangeOptions = {},
): Promise<{ available: boolean; conflicts: Conflict[] }> {
	const { unavailability, stayRows, eventRows, blockRows } =
		await loadUnavailability(db, roomId, checkIn, checkOut, options);
	const available = isStayAvailable({ checkIn, checkOut }, unavailability);
	const conflicts: Conflict[] = [
		...stayRows.map((s) => ({
			kind: s.status === 'pending' ? ('hold' as const) : ('booking' as const),
			source: 'direct',
			publicId: s.publicId,
			confirmationId: s.confirmationId,
			checkIn: s.checkIn,
			checkOut: s.checkOut,
			status: s.status,
			id: s.id,
			label: null,
		})),
		...eventRows.map((e) => ({
			kind: 'external' as const,
			source: e.source,
			publicId: null,
			confirmationId: null,
			checkIn: e.start,
			checkOut: e.end,
			status: e.kind,
			id: e.id,
			label: e.label,
		})),
		...blockRows.map((b) => ({
			kind: 'block' as const,
			source: 'block',
			publicId: null,
			confirmationId: null,
			checkIn: b.start,
			checkOut: b.end,
			status: 'blocked',
			id: b.id,
			label: b.reason,
		})),
	];
	return { available, conflicts };
}

/**
 * Bookings, live holds and imported events that an admin block
 * [start, end] (inclusive) would overlap. Used when creating/moving blocks.
 */
export async function findBlockConflicts(
	db: Database,
	roomId: string,
	start: IsoDate,
	end: IsoDate,
	now = new Date(),
) {
	const [stayRows, eventRows] = await Promise.all([
		db
			.select({
				publicId: bookings.publicId,
				confirmationId: bookings.confirmationId,
				checkIn: bookings.checkInDate,
				checkOut: bookings.checkOutDate,
				status: bookings.status,
			})
			.from(bookings)
			.where(
				and(
					eq(bookings.roomId, roomId),
					holdsDatesCondition(now),
					// blk.start < b.checkOut AND blk.end >= b.checkIn
					gt(bookings.checkOutDate, start),
					lte(bookings.checkInDate, end),
				),
			),
		db
			.select({
				uid: externalEvents.uid,
				checkIn: externalEvents.startDate,
				checkOut: externalEvents.endDate,
				kind: externalEvents.kind,
				source: icalFeeds.source,
			})
			.from(externalEvents)
			.innerJoin(icalFeeds, eq(externalEvents.feedId, icalFeeds.id))
			.where(
				and(
					eq(externalEvents.roomId, roomId),
					gt(externalEvents.endDate, start),
					lte(externalEvents.startDate, end),
				),
			),
	]);
	return [
		...stayRows.map((s) => ({
			publicId: s.publicId,
			confirmationId: s.confirmationId,
			source: 'direct' as string,
			checkIn: s.checkIn,
			checkOut: s.checkOut,
			status: s.status,
		})),
		...eventRows.map((e) => ({
			publicId: null,
			confirmationId: null,
			source: e.source as string,
			checkIn: e.checkIn,
			checkOut: e.checkOut,
			status: e.kind as string,
		})),
	];
}

/**
 * SQL condition, for an UPDATE/SELECT on `bookings`, that is true when the
 * row's stay overlaps no other confirmed booking, no live (or processing)
 * hold created earlier, no imported event and no admin block. Used by the
 * guarded confirmation update so the check and the write are one atomic
 * statement. (First hold wins while it is live: plan 02 decisions.)
 */
export const noOverlapForBookingRow = (now: Date) => sql`
	NOT EXISTS (
		SELECT 1 FROM bookings AS other
		WHERE other.room_id = bookings.room_id
			AND other.id <> bookings.id
			AND other.check_in_date < bookings.check_out_date
			AND other.check_out_date > bookings.check_in_date
			AND (
				other.status = 'confirmed'
				OR (
					other.status = 'pending'
					AND other.created_at < bookings.created_at
					AND (
						other.expires_at > ${Math.floor(now.getTime() / 1000)}
						OR other.payment_status = 'processing'
					)
				)
			)
	)
	AND NOT EXISTS (
		SELECT 1 FROM external_events AS ev
		WHERE ev.room_id = bookings.room_id
			AND ev.start_date < bookings.check_out_date
			AND ev.end_date > bookings.check_in_date
	)
	AND NOT EXISTS (
		SELECT 1 FROM room_blocked_periods AS blk
		WHERE blk.room_id = bookings.room_id
			AND blk.start_date < bookings.check_out_date
			AND blk.end_date >= bookings.check_in_date
	)`;

/**
 * SQL condition (no FROM needed) that is true when an admin block
 * [start, end] (inclusive) in `roomId` would overlap no booking that holds
 * dates, no imported event and no other block. Used as the WHERE of the
 * guarded block insert/update, so the check and the write are one statement
 * (assertBlockAllowed only produces the friendly error first).
 */
export function blockIsFree(
	roomId: string,
	start: string,
	end: string,
	now: Date,
	excludeBlockId: string | null = null,
) {
	const nowSeconds = Math.floor(now.getTime() / 1000);
	return sql`
		NOT EXISTS (
			SELECT 1 FROM bookings AS b
			WHERE b.room_id = ${roomId}
				AND b.check_out_date > ${start}
				AND b.check_in_date <= ${end}
				AND (
					b.status = 'confirmed'
					OR (
						b.status = 'pending'
						AND (b.expires_at > ${nowSeconds} OR b.payment_status = 'processing')
					)
				)
		)
		AND NOT EXISTS (
			SELECT 1 FROM external_events AS ev
			WHERE ev.room_id = ${roomId}
				AND ev.end_date > ${start}
				AND ev.start_date <= ${end}
		)
		AND NOT EXISTS (
			SELECT 1 FROM room_blocked_periods AS other
			WHERE other.room_id = ${roomId}
				AND other.start_date <= ${end}
				AND other.end_date >= ${start}
				AND (${excludeBlockId} IS NULL OR other.id <> ${excludeBlockId})
		)`;
}
