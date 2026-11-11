import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
	bookings,
	paymentRefunds,
	paymentTransactions,
} from '@/db/schema-export';
import { sendAdminAlert, sendRefundEmails } from '@/lib/email/email-service';
import {
	createInboxItemInBackground,
	type NewInboxItem,
} from '@/lib/inbox/inbox-service';
import { inBackground, type ServiceDeps } from '@/lib/server/deps';
import { STRIPE_METADATA_SOURCE, stripeId } from '@/lib/stripe/stripe';
import { formatMoney } from '@/utils/format';

import { type Booking, roomName } from './checkout-service';

// Refund webhooks (plan 02, 3.4): refund.created / refund.updated /
// refund.failed and charge.refunded. Every refund is upserted into
// payment_refunds; the stored status tells what is new, so replays and
// metadata-only updates send nothing.
// - Refunds the app made (metadata.source 'irishette': cancellations,
//   automatic refunds) only sync their status; their email went out already.
// - Refunds made in the Stripe Dashboard update the booking (a full refund
//   cancels it and frees the dates; a partial one updates the amounts),
//   email the guest and the admins, and create a refund_issued notification.
// - A failed refund alerts the admins (email + refund_failed notification).
// Server-only.

async function findRefundBooking(deps: ServiceDeps, refund: Stripe.Refund) {
	const intentId = stripeId(refund.payment_intent);
	if (intentId) {
		const [row] = await deps.db
			.select()
			.from(bookings)
			.where(eq(bookings.stripePaymentIntentId, intentId));
		if (row) return row;
	}
	const metadataBookingId = refund.metadata?.bookingId;
	if (metadataBookingId) {
		const [row] = await deps.db
			.select()
			.from(bookings)
			.where(eq(bookings.id, metadataBookingId));
		if (row) return row;
	}
	return undefined;
}

const cardReference = (refund: Stripe.Refund) =>
	refund.destination_details?.card?.reference ?? null;

/** The stored refund (status, reference) as it was before this event. */
async function storedRefund(deps: ServiceDeps, refundId: string) {
	const [row] = await deps.db
		.select({
			status: paymentRefunds.status,
			reference: paymentRefunds.reference,
		})
		.from(paymentRefunds)
		.where(eq(paymentRefunds.stripeRefundId, refundId));
	return row;
}

/** Stores the refund as Stripe reports it now. */
async function upsertRefund(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	booking: Booking | undefined,
	source: 'app' | 'dashboard',
	now: Date,
) {
	const values = {
		stripeRefundId: refund.id,
		bookingId: booking?.id ?? null,
		stripePaymentIntentId: stripeId(refund.payment_intent),
		stripeChargeId: stripeId(refund.charge),
		source,
		amount: refund.amount / 100,
		currency: refund.currency,
		status: refund.status ?? 'pending',
		reason: refund.reason ?? null,
		failureReason: refund.failure_reason ?? null,
		reference: cardReference(refund),
		stripeCreatedAt: new Date(refund.created * 1000),
		createdAt: now,
		updatedAt: now,
	};
	await deps.db
		.insert(paymentRefunds)
		.values(values)
		.onConflictDoUpdate({
			target: paymentRefunds.stripeRefundId,
			set: {
				bookingId: values.bookingId ?? undefined,
				amount: values.amount,
				status: values.status,
				reason: values.reason,
				failureReason: values.failureReason,
				...(values.reference ? { reference: values.reference } : {}),
				updatedAt: now,
			},
		});
}

type PreviousRefund = Awaited<ReturnType<typeof storedRefund>>;

/**
 * refund.created / refund.updated / refund.failed. The effects (booking
 * update, notifications) run first and the refund's new status is stored
 * last: if an effect fails, the webhook answers 500 and Stripe's retry still
 * sees the old status, so it redoes the work instead of skipping it.
 */
export async function handleRefundEvent(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	livemode: boolean,
	now = new Date(),
) {
	const booking = await findRefundBooking(deps, refund);
	const source =
		refund.metadata?.source === STRIPE_METADATA_SOURCE ? 'app' : 'dashboard';
	const previous = await storedRefund(deps, refund.id);
	const status = refund.status ?? 'pending';
	const statusChanged = previous?.status !== status;

	if (status === 'failed') {
		if (statusChanged) {
			await onRefundFailed(deps, refund, booking, source, livemode, now);
		}
	} else if (source === 'app') {
		if (statusChanged) {
			console.log(
				`Refund ${refund.id} (app${booking ? `, ${booking.confirmationId}` : ''}): ${status}`,
			);
		}
	} else if (booking) {
		await onDashboardRefund(deps, refund, booking, previous, livemode, now);
	} else {
		console.log(`Refund ${refund.id}: no booking (not ours), stored only`);
	}
	await upsertRefund(deps, refund, booking, source, now);
}

async function onRefundFailed(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	booking: Booking | undefined,
	source: 'app' | 'dashboard',
	livemode: boolean,
	now: Date,
) {
	if (booking && source === 'app') {
		await deps.db
			.update(bookings)
			.set({ paymentStatus: 'refund_failed', updatedAt: now })
			.where(eq(bookings.id, booking.id));
	}
	alertRefundFailed(deps, refund, booking, livemode);
}

/**
 * A refund made in the Stripe Dashboard: apply the charge totals to the
 * booking, update the refund_issued notification on every status change, and
 * email the guest and admins when the refund is new, succeeds, or gets its
 * trace reference.
 */
async function onDashboardRefund(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	booking: Booking,
	previous: PreviousRefund,
	livemode: boolean,
	now: Date,
) {
	const status = refund.status ?? 'pending';
	const statusChanged = previous?.status !== status;
	const reference = cardReference(refund);
	const notify =
		!previous ||
		(statusChanged && status === 'succeeded') ||
		(Boolean(reference) && !previous.reference);
	if (!notify && !statusChanged) return;

	const charge = await deps.stripe.charges.retrieve(
		stripeId(refund.charge) ?? '',
	);
	const updated = await applyChargeTotals(deps, booking, charge, refund, now);
	const totals = {
		totalRefunded: charge.amount_refunded / 100,
		remainingPaid: (charge.amount - charge.amount_refunded) / 100,
	};
	createInboxItemInBackground(
		deps,
		refundIssuedItem(refund, booking, updated, totals, livemode),
		{ resurfaceAfterSeconds: 0, now },
	);
	if (!notify) return;
	const roomInfo = await roomName(deps.db, booking.roomId);
	const card = charge.payment_method_details?.card;
	inBackground(deps, `refund emails ${refund.id}`, () =>
		sendRefundEmails(deps.db, deps.env, updated, roomInfo, {
			refundId: refund.id,
			amount: refund.amount / 100,
			currency: refund.currency,
			status,
			reason: refund.reason ?? null,
			created: new Date(refund.created * 1000),
			...totals,
			cardBrand: card?.brand ?? null,
			cardLast4: card?.last4 ?? null,
			reference,
		}),
	);
}

function refundIssuedItem(
	refund: Stripe.Refund,
	booking: Booking,
	updated: Booking,
	totals: { totalRefunded: number; remainingPaid: number },
	livemode: boolean,
): NewInboxItem<'refund_issued'> {
	const status = refund.status ?? 'pending';
	const amount = refund.amount / 100;
	const cancelledNow =
		updated.status === 'cancelled' && booking.status === 'confirmed';
	return {
		kind: 'refund_issued',
		title: `Refund in Stripe: ${booking.confirmationId}, ${formatMoney(amount, refund.currency)} (${status})`,
		summary: cancelledNow
			? 'Refunded in full in the Stripe Dashboard: the booking was cancelled and its dates are free.'
			: `Refunded in the Stripe Dashboard. ${formatMoney(totals.totalRefunded, refund.currency)} refunded so far, ${formatMoney(totals.remainingPaid, refund.currency)} still paid.`,
		details: {
			refundId: refund.id,
			amount,
			currency: refund.currency,
			status,
			reason: refund.reason ?? null,
			reference: cardReference(refund),
			...totals,
			paymentIntentId: stripeId(refund.payment_intent),
			confirmationId: booking.confirmationId,
			bookingStatus: updated.status,
			livemode,
		},
		bookingId: booking.id,
		userId: booking.userId,
		dedupeKey: `refund:${refund.id}`,
	};
}

/**
 * Applies a charge's refund totals to its booking: a full refund of a
 * confirmed booking cancels it (frees the dates); otherwise the refunded
 * amount and payment status are updated. Returns the booking afterwards.
 */
async function applyChargeTotals(
	deps: ServiceDeps,
	booking: Booking,
	charge: Stripe.Charge,
	refund: Stripe.Refund | null,
	now: Date,
): Promise<Booking> {
	const { db } = deps;
	const totalRefunded = charge.amount_refunded / 100;
	const full = charge.amount_refunded >= charge.amount;
	const paymentStatus = full ? 'refunded' : 'partially_refunded';
	await db
		.update(paymentTransactions)
		.set({
			amountRefunded: totalRefunded,
			status: paymentStatus,
			updatedAt: now,
		})
		.where(eq(paymentTransactions.bookingId, booking.id));
	if (full && booking.status === 'confirmed') {
		const [cancelled] = await db
			.update(bookings)
			.set({
				status: 'cancelled',
				paymentStatus,
				refundAmount: totalRefunded,
				cancelledAt: now,
				cancelledBy: 'system',
				cancellationReason: 'refunded_in_stripe',
				...(refund ? { stripeRefundId: refund.id } : {}),
				updatedAt: now,
			})
			.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'confirmed')))
			.returning();
		if (cancelled) {
			console.log(
				`Booking ${booking.confirmationId}: refunded in full in Stripe, cancelled`,
			);
			return cancelled;
		}
	}
	const [row] = await db
		.update(bookings)
		.set({ paymentStatus, refundAmount: totalRefunded, updatedAt: now })
		.where(eq(bookings.id, booking.id))
		.returning();
	return row ?? booking;
}

/** charge.refunded: totals only (no email; refund.* events handle those). */
export async function handleChargeRefunded(
	deps: ServiceDeps,
	charge: Stripe.Charge,
	now = new Date(),
) {
	const intentId = stripeId(charge.payment_intent);
	if (!intentId) return;
	const [booking] = await deps.db
		.select()
		.from(bookings)
		.where(eq(bookings.stripePaymentIntentId, intentId));
	if (!booking) return;
	const refunded = charge.amount_refunded / 100;
	const paymentStatus =
		charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded';
	await deps.db
		.update(bookings)
		.set({ paymentStatus, refundAmount: refunded, updatedAt: now })
		.where(eq(bookings.id, booking.id));
	await deps.db
		.update(paymentTransactions)
		.set({ amountRefunded: refunded, status: paymentStatus, updatedAt: now })
		.where(eq(paymentTransactions.bookingId, booking.id));
	console.log(
		`Booking ${booking.confirmationId}: ${paymentStatus} (${refunded})`,
	);
}

/** The admin alert for a failed refund: email + refund_failed notification. */
function alertRefundFailed(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	booking: Booking | undefined,
	livemode: boolean,
) {
	const intentId = stripeId(refund.payment_intent);
	const amount = refund.amount / 100;
	const failure = refund.failure_reason ?? null;
	console.error(
		`Refund ${refund.id} failed${booking ? ` for booking ${booking.confirmationId}` : ''}${failure ? ` (${failure})` : ''}`,
	);
	createInboxItemInBackground(deps, {
		kind: 'refund_failed',
		title: `Refund failed${booking ? `: ${booking.confirmationId}` : ''}`,
		summary: `Stripe could not complete a refund of $${amount.toFixed(2)}${failure ? ` (${failure})` : ''}. Check the payment in Stripe and contact the guest.`,
		details: {
			refundId: refund.id,
			amount,
			currency: refund.currency,
			paymentIntentId: intentId,
			confirmationId: booking?.confirmationId ?? null,
			failureReason: failure,
			livemode,
		},
		bookingId: booking?.id ?? null,
		userId: booking?.userId ?? null,
		dedupeKey: `refund_failed:${refund.id}`,
	});
	inBackground(deps, `refund failed ${refund.id}`, () =>
		sendAdminAlert(deps.db, deps.env, {
			subject: `Refund failed${booking ? `: ${booking.confirmationId}` : ''}`,
			heading: 'A refund failed',
			paragraphs: [
				'Stripe could not complete a refund. Check the payment in the Stripe dashboard and contact the guest.',
			],
			details: [
				{ label: 'Refund', value: refund.id },
				{ label: 'Amount', value: `$${amount.toFixed(2)}` },
				...(failure ? [{ label: 'Reason', value: failure }] : []),
				...(booking
					? [{ label: 'Confirmation', value: booking.confirmationId }]
					: []),
			],
			link: booking
				? { label: 'Open booking', path: `/admin/bookings/${booking.publicId}` }
				: undefined,
			idempotencyKey: `refund-failed/${refund.id}`,
		}),
	);
}
