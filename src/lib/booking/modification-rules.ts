import { daysBetween, type IsoDate } from '@/utils/date-range';

import type { BookingStatus, PaymentStatus } from './booking-status';

// Admin-only reservation changes (plan 06): pure rules shared by the server
// (modification-service.ts) and the admin modify page. Pure; client-safe.

export const modificationKinds = [
	'move',
	'extend',
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
 * Why a move, extension or room change is not allowed, or null:
 * check-out after check-in, no fewer nights than now (shortening is
 * "release early"), a new check-in not before today unless it is unchanged
 * (an in-progress stay can be extended), and something must change.
 */
export function changeError(
	current: StaySpec,
	next: StaySpec,
	today: IsoDate,
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
	const nights = daysBetween(current.checkIn, current.checkOut);
	if (daysBetween(next.checkIn, next.checkOut) < nights) {
		return `A change cannot shorten the stay (now ${nights} night${nights === 1 ? '' : 's'}). Use "Release room early" for an early departure.`;
	}
	if (next.checkIn !== current.checkIn && next.checkIn < today) {
		return 'The new check-in cannot be in the past.';
	}
	return null;
}

/** Why the room can't be released from `newCheckOut`, or null. */
export function releaseEarlyError(
	current: Pick<StaySpec, 'checkIn' | 'checkOut'>,
	newCheckOut: IsoDate,
	today: IsoDate,
): string | null {
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
	if (next.checkIn === current.checkIn) return 'extend';
	return 'move';
}

/** Signed difference in cents: positive is charged, negative refunded. */
export const differenceInCents = (newTotal: number, oldTotal: number) =>
	Math.round(newTotal * 100) - Math.round(oldTotal * 100);

export const MODIFICATION_KIND_LABELS: Record<ModificationKind, string> = {
	move: 'Dates moved',
	extend: 'Stay extended',
	change_room: 'Room changed',
	release_early: 'Released early',
};
