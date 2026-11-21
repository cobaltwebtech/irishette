import type { IsoDate } from '@/utils/date-range';

import type { BookingStatus, PaymentStatus } from './booking-status';

// Admin-only reservation changes (plan 06): pure rules shared by the server
// (modification-service.ts) and the admin modify page. Pure; client-safe.

export const modificationKinds = [
	'move',
	'extend',
	'shorten',
	'change_room',
	'release_early',
] as const;
export type ModificationKind = (typeof modificationKinds)[number];

/**
 * - applied: the booking changed and the money moved (or none was due).
 * - payment_pending: changed, the extra charge authorized but not yet
 *   captured and recorded (the recovery cron finishes it).
 * - refund_pending: changed, the refund not created yet (the cron retries).
 * - refund_failed: changed, Stripe refused the refund (admins alerted).
 * - payment_failed: changed, but the extra charge could not be captured
 *   (admins alerted to collect it by hand).
 */
export const modificationStatuses = [
	'applied',
	'payment_pending',
	'refund_pending',
	'refund_failed',
	'payment_failed',
] as const;
export type ModificationStatus = (typeof modificationStatuses)[number];

export const MODIFIABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
	'paid',
	'partially_refunded',
];

export interface StaySpec {
	roomId: string;
	checkIn: IsoDate;
	checkOut: IsoDate;
}

/** Why this booking can't be changed now, or null. */
export function modifiableError(booking: {
	status: BookingStatus;
	paymentStatus: PaymentStatus;
}): string | null {
	if (booking.status !== 'confirmed') {
		return 'Only confirmed bookings can be changed.';
	}
	if (!MODIFIABLE_PAYMENT_STATUSES.includes(booking.paymentStatus)) {
		return booking.paymentStatus === 'authorized'
			? 'The payment for this booking is still being completed. Try again in a few minutes.'
			: 'A refund is still being processed for this booking. Resolve it before changing the reservation.';
	}
	return null;
}

/**
 * Why a move, extension, shortening or room change is not allowed, or null:
 * check-out after check-in and something must change. Before the stay begins
 * (check-in time) any length is allowed, with a check-in not before today.
 * Once it has begun the check-in stays and the stay can only get longer: an
 * early departure is "release early" (no refund).
 */
export function changeError(
	current: StaySpec,
	next: StaySpec,
	today: IsoDate,
	{ stayBegun }: { stayBegun: boolean },
): string | null {
	if (next.checkOut <= next.checkIn) {
		return 'Check-out must be after check-in.';
	}
	if (
		next.roomId === current.roomId &&
		next.checkIn === current.checkIn &&
		next.checkOut === current.checkOut
	) {
		return 'Nothing to change: pick other dates or another room.';
	}
	if (stayBegun) {
		if (next.checkIn !== current.checkIn) {
			return 'The stay has begun: its check-in cannot change.';
		}
		if (next.checkOut < current.checkOut) {
			return 'The stay has begun: to leave early, release the room instead (no refund).';
		}
		return null;
	}
	if (next.checkIn < today) {
		return 'The new check-in cannot be in the past.';
	}
	return null;
}

/**
 * Why the room can't be released from `newCheckOut`, or null. Only a stay
 * that has begun is released early (no refund); before check-in, shorten it
 * as a change instead (repriced, the difference refunded).
 */
export function releaseEarlyError(
	current: Pick<StaySpec, 'checkIn' | 'checkOut'>,
	newCheckOut: IsoDate,
	today: IsoDate,
	{ stayBegun }: { stayBegun: boolean },
): string | null {
	if (!stayBegun) {
		return 'The stay has not begun: change the dates instead (the difference is refunded).';
	}
	if (newCheckOut >= current.checkOut) {
		return 'The new check-out must be before the current check-out.';
	}
	if (newCheckOut <= current.checkIn) {
		return 'The stay must keep at least one night. Cancel the booking instead.';
	}
	if (newCheckOut < today) {
		return 'The new check-out cannot be in the past.';
	}
	return null;
}

/** What kind of change this is (for the audit trail and emails). */
export function modificationKind(
	current: StaySpec,
	next: StaySpec,
): Exclude<ModificationKind, 'release_early'> {
	if (next.roomId !== current.roomId) return 'change_room';
	if (next.checkIn !== current.checkIn) return 'move';
	return next.checkOut < current.checkOut ? 'shorten' : 'extend';
}

/** Signed difference in cents: positive is charged, negative refunded. */
export const differenceInCents = (newTotal: number, oldTotal: number) =>
	Math.round(newTotal * 100) - Math.round(oldTotal * 100);

export const MODIFICATION_KIND_LABELS: Record<ModificationKind, string> = {
	move: 'Dates moved',
	extend: 'Stay extended',
	shorten: 'Stay shortened',
	change_room: 'Room changed',
	release_early: 'Released early',
};
