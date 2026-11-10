import { z } from 'zod';

// Booking and payment statuses, shared by the schema, the server and the
// pages (plan 02, 3.6). Pure, client-safe.

/** Stored booking status. Stay timing is derived (stayPhase), not stored. */
export const bookingStatuses = ['pending', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
export const bookingStatusSchema = z.enum(bookingStatuses);

/**
 * Payment status of a booking (and of its payment_transactions row).
 * - pending: not paid yet (a hold; a failed payment leaves it pending until
 *   the hold expires)
 * - processing: a delayed payment method (bank debit) is pending
 * - paid, partially_refunded, refunded
 * - refund_pending: cancelled, refund being created
 * - refund_failed: the refund failed (the booking stays cancelled; admins
 *   are alerted)
 */
export const paymentStatuses = [
	'pending',
	'processing',
	'paid',
	'partially_refunded',
	'refunded',
	'refund_pending',
	'refund_failed',
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export const paymentStatusSchema = z.enum(paymentStatuses);

/** Payment statuses where the guest's money (or part of it) is with us. */
export const PAID_STATUSES: readonly PaymentStatus[] = [
	'paid',
	'partially_refunded',
];
