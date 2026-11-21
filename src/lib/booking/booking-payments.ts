import { desc, eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import { paymentRefunds, paymentTransactions } from '@/db/schema-export';
import type { ServiceDeps } from '@/lib/server/deps';
import { stripeBookingMetadata, toCents } from '@/lib/stripe/stripe';

import { type Booking, recordAppRefund } from './checkout-service';
import {
	OFFLINE_PAYMENT_METHOD,
	OFFLINE_REFUND_PREFIX,
} from './payment-methods';
import { divideSplit, splitColumns, type TaxSplit } from './tax-split';

// A booking's payments (plan 06): the checkout payment plus one per extra
// charge for an approved change, each a payment_transactions row. Refunds
// are spread across them and the booking's refunded amount is derived from
// them. A payment an admin took outside Stripe (cash, check or other) gets
// its refund recorded as owed, for the admins to pay back by hand.
// Server-only.

type Payment = {
	/** payment_transactions id (null: a legacy booking with no row). */
	id: string | null;
	/** The PaymentIntent (null: a payment taken outside Stripe). */
	intent: string | null;
	amountCents: number;
	refundedCents: number;
};

/** A refund made (Stripe) or recorded as owed (offline), in cents. */
export interface BookingRefund {
	/** The Stripe refund id, or OFFLINE_REFUND_PREFIX + key for offline. */
	id: string;
	amount: number;
}

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
		.filter(
			(row) =>
				row.stripePaymentIntentId ||
				row.paymentMethod === OFFLINE_PAYMENT_METHOD,
		)
		.map((row) => ({
			id: row.id,
			intent: row.stripePaymentIntentId,
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
 * payment's refunded total; a payment taken outside Stripe gets its part
 * recorded as owed (recordOfflineRefund), with no Stripe call. Stripe
 * errors propagate (the caller tells transient from permanent); a retry
 * continues where it stopped. Returns the refunds (this call's and, on a
 * retry, earlier ones) and any amount the payments could not cover.
 */
export async function refundAcrossPayments(
	deps: ServiceDeps,
	booking: Booking,
	cents: number,
	request: RefundRequest,
	now = new Date(),
): Promise<{ refunds: BookingRefund[]; uncoveredCents: number }> {
	const { db } = deps;
	const payments = await bookingPayments(db, booking);
	const refunds = request.retry
		? await earlierRefunds(deps, booking, payments, request, now)
		: [];
	let remaining = cents - refunds.reduce((sum, r) => sum + r.amount, 0);
	for (const payment of payments) {
		if (remaining <= 0) break;
		const made = payment.intent
			? await stripeRefund(
					deps,
					booking,
					{ payment, intent: payment.intent },
					remaining,
					request,
					now,
				)
			: await recordOfflineRefund(
					db,
					booking,
					payment,
					remaining,
					request,
					now,
				);
		if (!made) continue;
		refunds.push(made);
		remaining -= made.amount;
	}
	if (request.split && refunds.length > 0) {
		await saveRefundSplits(db, refunds, request.split);
	}
	return { refunds, uncoveredCents: Math.max(0, remaining) };
}

/**
 * A retry: the refunds this request already made in Stripe (idempotency keys
 * only last 24 hours), recorded, with each Stripe payment's refunded total
 * read back from Stripe. Offline refunds are found by recordOfflineRefund.
 */
async function earlierRefunds(
	{ db, stripe }: ServiceDeps,
	booking: Booking,
	payments: Payment[],
	request: RefundRequest,
	now: Date,
): Promise<BookingRefund[]> {
	const ours = (r: Stripe.Refund) =>
		r.metadata?.bookingId === booking.id &&
		r.metadata?.reason === request.reason &&
		// One cancellation per booking; modifications are told apart by key.
		(request.reason === 'cancellation' ||
			r.metadata?.refundKey === request.refundKey);
	const found: BookingRefund[] = [];
	for (const payment of payments) {
		if (!payment.intent) continue;
		const list = await stripe.refunds.list({
			payment_intent: payment.intent,
			limit: 100,
		});
		const live = list.data.filter(liveRefund);
		payment.refundedCents = live.reduce((sum, r) => sum + r.amount, 0);
		for (const refund of live.filter(ours)) {
			found.push({ id: refund.id, amount: refund.amount });
			await recordAppRefund(db, refund, booking.id, now);
		}
		await saveRefunded(db, payment, now);
	}
	return found;
}

/** Refunds up to what is left on a Stripe payment, and records it. */
async function stripeRefund(
	{ db, stripe }: ServiceDeps,
	booking: Booking,
	{ payment, intent }: { payment: Payment; intent: string },
	remaining: number,
	request: RefundRequest,
	now: Date,
): Promise<BookingRefund | null> {
	const part = Math.min(payment.amountCents - payment.refundedCents, remaining);
	if (part <= 0) return null;
	const refund = await stripe.refunds.create(
		{
			payment_intent: intent,
			amount: part,
			reason: 'requested_by_customer',
			metadata: {
				...stripeBookingMetadata(booking),
				reason: request.reason,
				refundKey: request.refundKey,
				...request.metadata,
			},
		},
		{ idempotencyKey: `${request.refundKey}/${intent}` },
	);
	payment.refundedCents += part;
	await recordAppRefund(db, refund, booking.id, now);
	await saveRefunded(db, payment, now);
	return { id: refund.id, amount: part };
}

/**
 * A payment taken outside Stripe: records its part of the refund as owed
 * (source 'offline', succeeded now: the admins pay it back by hand) and the
 * payment's refunded total in one batch. The id comes from the refund key,
 * so a retry finds the refund it already recorded instead of adding one.
 */
async function recordOfflineRefund(
	db: Database,
	booking: Booking,
	payment: Payment,
	remaining: number,
	request: RefundRequest,
	now: Date,
): Promise<BookingRefund | null> {
	if (!payment.id) return null;
	const id = `${OFFLINE_REFUND_PREFIX}${request.refundKey}/${payment.id}`;
	const [existing] = await db
		.select({ amount: paymentRefunds.amount })
		.from(paymentRefunds)
		.where(eq(paymentRefunds.stripeRefundId, id));
	if (existing) return { id, amount: toCents(existing.amount) };
	const part = Math.min(payment.amountCents - payment.refundedCents, remaining);
	if (part <= 0) return null;
	payment.refundedCents += part;
	await db.batch([
		db.insert(paymentRefunds).values({
			stripeRefundId: id,
			bookingId: booking.id,
			source: 'offline',
			amount: part / 100,
			currency: 'usd',
			status: 'succeeded',
			reason: 'requested_by_customer',
			stripeCreatedAt: now,
			createdAt: now,
			updatedAt: now,
		}),
		refundedUpdate(db, payment, now),
	]);
	return { id, amount: part };
}

/** Stores each refund's share of the request's tax split. */
async function saveRefundSplits(
	db: Database,
	refunds: BookingRefund[],
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
	await refundedUpdate(db, payment, now);
}

/** The payment row's refunded total and status (payment.id is set). */
function refundedUpdate(db: Database, payment: Payment, now: Date) {
	return db
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
		.where(eq(paymentTransactions.id, payment.id ?? ''));
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
