import { TRPCError } from '@trpc/server';
import {
	env as workerEnv,
	waitUntil as workerWaitUntil,
} from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { bookings } from '@/db/schema-export';

type Booking = typeof bookings.$inferSelect;

import { confirmBookingPayment } from './booking-service';
import { createServiceDeps, inBackground, type ServiceDeps } from './deps';
import { sendAdminAlert } from './email-service';
import {
	createInboxItemInBackground,
	type NewInboxItem,
} from './inbox-service';

// Stripe webhook for the booking flow: POST /api/stripe/webhook.
// (Better Auth's Stripe plugin has its own endpoint under /api/auth.)
//
// Responses never echo verification details, and logs carry Stripe ids and
// confirmation ids only (no names or email addresses).

const text = (body: string, status: number) =>
	new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

export async function handleStripeWebhook(
	request: Request,
	{
		env = workerEnv,
		waitUntil = workerWaitUntil,
	}: {
		env?: Env;
		waitUntil?: (promise: Promise<unknown>) => void;
	} = {},
): Promise<Response> {
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return text('Invalid content type', 400);
	}
	const signature = request.headers.get('stripe-signature');
	if (!signature) return text('Missing signature', 400);

	const deps = createServiceDeps(env, waitUntil);
	const body = await request.text();
	let event: Stripe.Event;
	try {
		event = await deps.stripe.webhooks.constructEventAsync(
			body,
			signature,
			env.STRIPE_TRPC_WEBHOOK_SECRET,
		);
	} catch {
		console.warn('Stripe webhook: signature verification failed');
		return text('Invalid signature', 400);
	}

	try {
		await dispatch(deps, event);
		return text('ok', 200);
	} catch (error) {
		// Stripe retries non-2xx responses, which is what we want for
		// transient failures (database, Stripe API).
		console.error(
			`Stripe webhook ${event.type} ${event.id} failed:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return text('Webhook processing error', 500);
	}
}

async function dispatch(deps: ServiceDeps, event: Stripe.Event) {
	switch (event.type) {
		case 'payment_intent.succeeded':
			return onPaymentIntentSucceeded(deps, event.data.object);
		case 'payment_intent.payment_failed':
			console.log(
				`PaymentIntent ${event.data.object.id} failed; the hold stays until it expires`,
			);
			return;
		case 'charge.refunded':
			return onChargeRefunded(deps, event.data.object);
		case 'refund.failed':
			return onRefundFailed(deps, event.data.object, event.livemode);
		case 'refund.updated':
			if (event.data.object.status === 'failed') {
				return onRefundFailed(deps, event.data.object, event.livemode);
			}
			return;
		default:
			// Acknowledge everything else so Stripe does not retry.
			return;
	}
}

async function findBooking(
	deps: ServiceDeps,
	intentId: string,
	metadataBookingId?: string,
) {
	const { db } = deps;
	if (metadataBookingId) {
		const [row] = await db
			.select()
			.from(bookings)
			.where(eq(bookings.id, metadataBookingId));
		if (row) return row;
	}
	const [row] = await db
		.select()
		.from(bookings)
		.where(eq(bookings.stripePaymentIntentId, intentId));
	return row;
}

/** Backup for the front-end confirm (the guest may close the tab). */
async function onPaymentIntentSucceeded(
	deps: ServiceDeps,
	intent: Stripe.PaymentIntent,
) {
	const booking = await findBooking(
		deps,
		intent.id,
		intent.metadata?.bookingId,
	);
	if (!booking) {
		console.log(`PaymentIntent ${intent.id}: no booking (not ours), ignored`);
		return;
	}
	try {
		const outcome = await confirmBookingPayment(deps, booking.id, intent.id);
		console.log(
			`PaymentIntent ${intent.id}: booking ${booking.confirmationId} ${outcome.status}`,
		);
	} catch (error) {
		// Verification failures are permanent: acknowledge, don't retry.
		if (error instanceof TRPCError && error.code !== 'INTERNAL_SERVER_ERROR') {
			console.warn(
				`PaymentIntent ${intent.id}: booking ${booking.confirmationId} not confirmed (${error.code})`,
			);
			return;
		}
		throw error;
	}
}

/** Keeps payment status in sync with refunds (also ones made in the dashboard). */
async function onChargeRefunded(deps: ServiceDeps, charge: Stripe.Charge) {
	const intentId =
		typeof charge.payment_intent === 'string'
			? charge.payment_intent
			: charge.payment_intent?.id;
	if (!intentId) return;
	const booking = await findBooking(deps, intentId);
	if (!booking) return;
	const refunded = charge.amount_refunded / 100;
	const paymentStatus =
		charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded';
	await deps.db
		.update(bookings)
		.set({ paymentStatus, refundAmount: refunded, updatedAt: new Date() })
		.where(eq(bookings.id, booking.id));
	console.log(
		`Booking ${booking.confirmationId}: ${paymentStatus} (${refunded})`,
	);
}

/** The admin inbox item for a failed refund (dedupe: one per refund). */
function refundFailedInboxItem(
	refund: Stripe.Refund,
	paymentIntentId: string | null,
	booking: Pick<Booking, 'id' | 'userId' | 'confirmationId'> | undefined,
	livemode: boolean,
): NewInboxItem<'refund_failed'> {
	const amount = refund.amount / 100;
	const reason = refund.failure_reason ? ` (${refund.failure_reason})` : '';
	return {
		kind: 'refund_failed',
		title: `Refund failed${booking ? `: ${booking.confirmationId}` : ''}`,
		summary: `Stripe could not complete a refund of $${amount.toFixed(2)}${reason}. Check the payment in Stripe and contact the guest.`,
		details: {
			refundId: refund.id,
			amount,
			currency: refund.currency,
			paymentIntentId,
			confirmationId: booking?.confirmationId ?? null,
			failureReason: refund.failure_reason ?? null,
			livemode,
		},
		bookingId: booking?.id ?? null,
		userId: booking?.userId ?? null,
		dedupeKey: `refund_failed:${refund.id}`,
	};
}

async function onRefundFailed(
	deps: ServiceDeps,
	refund: Stripe.Refund,
	livemode: boolean,
) {
	const intentId =
		typeof refund.payment_intent === 'string'
			? refund.payment_intent
			: refund.payment_intent?.id;
	const booking = intentId ? await findBooking(deps, intentId) : undefined;
	console.error(
		`Refund ${refund.id} failed${booking ? ` for booking ${booking.confirmationId}` : ''}`,
	);
	createInboxItemInBackground(
		deps,
		refundFailedInboxItem(refund, intentId ?? null, booking, livemode),
	);
	inBackground(deps, `refund failed ${refund.id}`, () =>
		sendAdminAlert(deps.db, deps.env, {
			subject: `Refund failed${booking ? `: ${booking.confirmationId}` : ''}`,
			heading: 'A refund failed',
			paragraphs: [
				'Stripe could not complete a refund. Check the payment in the Stripe dashboard and contact the guest.',
			],
			details: [
				{ label: 'Refund', value: refund.id },
				{ label: 'Amount', value: `$${(refund.amount / 100).toFixed(2)}` },
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
