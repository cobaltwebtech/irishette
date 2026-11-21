import { desc, eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import { paymentRefunds, paymentTransactions } from '@/db/schema-export';
import type { ServiceDeps } from '@/lib/server/deps';
import { stripeBookingMetadata, toCents } from '@/lib/stripe/stripe';

import { type Booking, recordAppRefund } from './checkout-service';
import { divideSplit, splitColumns, type TaxSplit } from './tax-split';

// A booking's payments (plan 06): the checkout payment plus one per extra
// charge for an approved change, each a payment_transactions row. Refunds
// are spread across them and the booking's refunded amount is derived from
// them. Server-only.

type Payment = {
	/** payment_transactions id (null: a legacy booking with no row). */
	id: string | null;
	intent: string;
	amountCents: number;
	refundedCents: number;
};

/** The booking's payments, newest first (refunds take the newest first). */
async function bookingPayments(
	db: Database,
	booking: Booking,
): Promise<Payment[]> {
	const rows = await db
		.select()
		.from(paymentTransactions)
		.where(eq(paymentTransactions.bookingId, booking.id))
		.orderBy(desc(paymentTransactions.createdAt));
	const payments = rows
		.filter((row) => row.stripePaymentIntentId)
		.map((row) => ({
			id: row.id,
			intent: row.stripePaymentIntentId ?? '',
			amountCents: toCents(row.amount),
			refundedCents: toCents(row.amountRefunded),
		}));
	if (payments.length > 0 || !booking.stripePaymentIntentId) return payments;
	return [
		{
			id: null,
			intent: booking.stripePaymentIntentId,
			amountCents: toCents(booking.totalAmount),
			refundedCents: toCents(booking.refundAmount ?? 0),
		},
	];
}

const liveRefund = (r: Stripe.Refund) =>
	r.status !== 'failed' && r.status !== 'canceled';

export interface RefundRequest {
	/** metadata.reason: 'cancellation' or 'modification'. */
	reason: 'cancellation' | 'modification';
	/**
	 * Identifies this refund across retries (idempotency key prefix and
	 * metadata.refundKey), e.g. refund-cancel/<bookingId>/<cents>.
	 */
	refundKey: string;
	metadata?: Record<string, string>;
	/**
	 * Room / fee / tax of the whole refund (tax-split.ts), stored on the
	 * refund rows (divided by amount when several are made).
	 */
	split?: TaxSplit | null;
	/**
	 * A retry (recovery cron): read each payment's refunds from Stripe first,
	 * count the ones this request already made and use Stripe's refunded
	 * totals (idempotency keys only last 24 hours).
	 */
	retry?: boolean;
}

/**
 * Refunds `cents` across the booking's payments, newest first, each up to
 * what is left on it. Records every refund (payment_refunds) and the
 * payment's refunded total. Stripe errors propagate (the caller tells
 * transient from permanent); a retry continues where it stopped. Returns the
 * refunds (this call's and, on a retry, earlier ones) and any amount the
 * payments could not cover.
 */
export async function refundAcrossPayments(
	deps: ServiceDeps,
	booking: Booking,
	cents: number,
	request: RefundRequest,
	now = new Date(),
): Promise<{ refunds: Stripe.Refund[]; uncoveredCents: number }> {
	const { db, stripe } = deps;
	const payments = await bookingPayments(db, booking);
	const refunds: Stripe.Refund[] = [];
	let remaining = cents;
	const ours = (r: Stripe.Refund) =>
		r.metadata?.bookingId === booking.id &&
		r.metadata?.reason === request.reason &&
		// One cancellation per booking; modifications are told apart by key.
		(request.reason === 'cancellation' ||
			r.metadata?.refundKey === request.refundKey);

	if (request.retry) {
		for (const payment of payments) {
			const list = await stripe.refunds.list({
				payment_intent: payment.intent,
				limit: 100,
			});
			const live = list.data.filter(liveRefund);
			payment.refundedCents = live.reduce((sum, r) => sum + r.amount, 0);
			for (const refund of live.filter(ours)) {
				remaining -= refund.amount;
				refunds.push(refund);
				await recordAppRefund(db, refund, booking.id, now);
			}
			await saveRefunded(db, payment, now);
		}
	}

	for (const payment of payments) {
		if (remaining <= 0) break;
		const part = Math.min(
			payment.amountCents - payment.refundedCents,
			remaining,
		);
		if (part <= 0) continue;
		const refund = await stripe.refunds.create(
			{
				payment_intent: payment.intent,
				amount: part,
				reason: 'requested_by_customer',
				metadata: {
					...stripeBookingMetadata(booking),
					reason: request.reason,
					refundKey: request.refundKey,
					...request.metadata,
				},
			},
			{ idempotencyKey: `${request.refundKey}/${payment.intent}` },
		);
		refunds.push(refund);
		remaining -= part;
		payment.refundedCents += part;
		await recordAppRefund(db, refund, booking.id, now);
		await saveRefunded(db, payment, now);
	}
	if (request.split && refunds.length > 0) {
		await saveRefundSplits(db, refunds, request.split);
	}
	return { refunds, uncoveredCents: Math.max(0, remaining) };
}

/** Stores each refund's share of the request's tax split. */
async function saveRefundSplits(
	db: Database,
	refunds: Stripe.Refund[],
	split: TaxSplit,
) {
	const parts = divideSplit(
		split,
		refunds.map((r) => r.amount),
	);
	for (const [index, refund] of refunds.entries()) {
		await db
			.update(paymentRefunds)
			.set(splitColumns(parts[index] ?? null))
			.where(eq(paymentRefunds.stripeRefundId, refund.id));
	}
}

async function saveRefunded(db: Database, payment: Payment, now: Date) {
	if (!payment.id) return;
	await db
		.update(paymentTransactions)
		.set({
			amountRefunded: payment.refundedCents / 100,
			status:
				payment.refundedCents >= payment.amountCents
					? 'refunded'
					: payment.refundedCents > 0
						? 'partially_refunded'
						: 'paid',
			updatedAt: now,
		})
		.where(eq(paymentTransactions.id, payment.id));
}

/**
 * Dollars refunded against the booking's current total (what cancellation
 * refunds and the policy percentage are measured from): the total minus
 * what the guest still has paid across all payments. Refunds for a cheaper
 * change lower the total too, so they cancel out. Null when the booking has
 * no payment rows (the caller falls back to the charge's own totals).
 */
export async function refundedAgainstTotal(
	db: Database,
	booking: Booking,
): Promise<number | null> {
	const payments = await bookingPayments(db, booking);
	if (payments.every((p) => p.id === null)) return null;
	const netPaid = payments.reduce(
		(sum, p) => sum + p.amountCents - p.refundedCents,
		0,
	);
	return Math.max(0, toCents(booking.totalAmount) - netPaid) / 100;
}

/** The booking whose payment (first or extra) is this PaymentIntent. */
export async function bookingIdForIntent(db: Database, intentId: string) {
	const [row] = await db
		.select({ bookingId: paymentTransactions.bookingId })
		.from(paymentTransactions)
		.where(eq(paymentTransactions.stripePaymentIntentId, intentId));
	return row?.bookingId ?? null;
}
