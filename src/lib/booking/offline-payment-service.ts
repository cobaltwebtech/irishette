import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import { bookings, paymentTransactions } from '@/db/schema-export';
import { sendBookingConfirmedEmails } from '@/lib/email/email-service';
import { syncRoomFeeds } from '@/lib/ical/ical-sync';
import { inBackground, type ServiceDeps } from '@/lib/server/deps';

import { noOverlapForBookingRow } from './availability';
import { type Booking, closeHoldSession, roomName } from './checkout-service';
import { OFFLINE_PAYMENT_METHOD } from './payment-methods';
import { bookingSplit, splitColumns, type TaxSplit } from './tax-split';

// Payments an admin takes outside Stripe (cash, check or another way) and
// reconciles by hand. The booking is confirmed and the payment recorded with
// its room / fee / tax split, so the tax report counts it like a card
// payment. Refunds owed on these payments are recorded, not sent
// (booking-payments.ts). Server-only.

/** The booking has a payment taken outside Stripe. */
export async function hasOfflinePayment(db: Database, bookingId: string) {
	const [row] = await db
		.select({ id: paymentTransactions.id })
		.from(paymentTransactions)
		.where(
			and(
				eq(paymentTransactions.bookingId, bookingId),
				eq(paymentTransactions.paymentMethod, OFFLINE_PAYMENT_METHOD),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** SQL: the booking row has a payment taken outside Stripe (guest lists). */
export const offlinePaymentExists = sql<boolean>`EXISTS (
	SELECT 1 FROM payment_transactions AS p
	WHERE p.booking_id = ${bookings.id}
		AND p.payment_method = ${OFFLINE_PAYMENT_METHOD}
)`;

/** Records a payment taken outside Stripe (no Stripe ids). */
export async function recordOfflinePayment(
	db: Database,
	bookingId: string,
	amount: number,
	split: TaxSplit | null,
	now: Date,
) {
	await db.insert(paymentTransactions).values({
		bookingId,
		amount,
		status: 'paid',
		paymentMethod: OFFLINE_PAYMENT_METHOD,
		...splitColumns(split),
		createdAt: now,
		updatedAt: now,
	});
}

const notAwaitingPayment = () =>
	new TRPCError({
		code: 'BAD_REQUEST',
		message: 'This booking is not awaiting payment',
	});

/**
 * Confirms an admin's hold paid outside Stripe: the dates are claimed in one
 * guarded UPDATE (as a card payment's are), the payment recorded with the
 * booking's tax split, and the confirmation emails sent. Any open Checkout
 * Session of the hold is expired first so the guest can't also pay by card.
 */
export async function confirmOfflinePayment(
	deps: ServiceDeps,
	booking: Booking,
	now = new Date(),
): Promise<Booking> {
	const { db } = deps;
	if (booking.status !== 'pending' || !booking.createdByAdminId) {
		throw notAwaitingPayment();
	}
	if (!booking.expiresAt || booking.expiresAt <= now) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'The hold on these dates expired. Start the booking again.',
		});
	}
	if ((await closeHoldSession(deps, booking, now)) === 'paid') {
		// The card session was paid after all: that payment confirmed it.
		throw notAwaitingPayment();
	}
	// Pick up reservations made on other platforms since the last cron run.
	await syncRoomFeeds(deps, booking.roomId, { trigger: 'checkout' }).catch(
		(error: unknown) => {
			console.warn(
				'Feed sync before an offline payment failed:',
				error instanceof Error ? error.message : 'Unknown error',
			);
		},
	);
	const [confirmed] = await db
		.update(bookings)
		.set({
			status: 'confirmed',
			paymentStatus: 'paid',
			confirmedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				noOverlapForBookingRow(now),
			),
		)
		.returning();
	if (!confirmed) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: 'These dates were just booked elsewhere. Choose other dates.',
		});
	}
	try {
		await recordOfflinePayment(
			db,
			confirmed.id,
			confirmed.totalAmount,
			bookingSplit(confirmed),
			now,
		);
	} catch (error) {
		// No payment row, no confirmed booking: back to the hold.
		await db
			.update(bookings)
			.set({ status: 'pending', paymentStatus: 'pending', confirmedAt: null })
			.where(eq(bookings.id, confirmed.id));
		throw error;
	}
	const roomInfo = await roomName(db, confirmed.roomId);
	inBackground(deps, `confirmation ${confirmed.confirmationId}`, () =>
		sendBookingConfirmedEmails(db, deps.env, confirmed, roomInfo),
	);
	return confirmed;
}
