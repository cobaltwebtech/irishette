import { TRPCError } from '@trpc/server';
import {
	env as workerEnv,
	waitUntil as workerWaitUntil,
} from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { bookings } from '@/db/schema-export';

import {
	confirmBookingPayment,
	loadBooking,
	markProcessing,
	releaseExpiredSessionHold,
	releaseFailedPayment,
} from './checkout-service';
import { createServiceDeps, type ServiceDeps } from './deps';
import { handleDisputeEvent } from './dispute-service';
import { handleChargeRefunded, handleRefundEvent } from './refund-service';

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

/**
 * Keep in sync with docs/STRIPE_WEBHOOKS.md ("Booking payments with Checkout
 * Sessions"): the sandbox and live endpoints subscribe to exactly these.
 */
async function dispatch(deps: ServiceDeps, event: Stripe.Event) {
	switch (event.type) {
		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded':
			return onSessionPaidOrCompleted(deps, event.data.object);
		case 'checkout.session.async_payment_failed':
			return onSessionPaymentFailed(deps, event.data.object);
		case 'checkout.session.expired': {
			const released = await releaseExpiredSessionHold(
				deps,
				event.data.object.id,
			);
			if (released) {
				console.log(
					`Checkout Session ${event.data.object.id} expired: hold ${released} released`,
				);
			}
			return;
		}
		case 'refund.created':
		case 'refund.updated':
		case 'refund.failed':
			return handleRefundEvent(deps, event.data.object, event.livemode);
		case 'charge.refunded':
			return handleChargeRefunded(deps, event.data.object);
		case 'charge.dispute.created':
		case 'charge.dispute.updated':
		case 'charge.dispute.closed':
		case 'charge.dispute.funds_withdrawn':
		case 'charge.dispute.funds_reinstated':
			await handleDisputeEvent(deps, event);
			return;
		case 'payment_intent.payment_failed':
			console.log(
				`PaymentIntent ${event.data.object.id} failed; the hold stays until it expires`,
			);
			return;
		default:
			// Acknowledge everything else so Stripe does not retry.
			return;
	}
}

/** Our booking for a Checkout Session: client_reference_id, metadata, stored id. */
async function findSessionBooking(
	deps: ServiceDeps,
	session: Stripe.Checkout.Session,
) {
	const id = session.metadata?.bookingId ?? session.client_reference_id;
	if (id) {
		const row = await loadBooking(deps.db, id);
		if (row) return row;
	}
	const [row] = await deps.db
		.select()
		.from(bookings)
		.where(eq(bookings.stripeSessionId, session.id));
	return row;
}

/**
 * checkout.session.completed / async_payment_succeeded: confirm when paid;
 * a completed but unpaid session (delayed payment method) marks the hold
 * processing. confirmBookingPayment re-reads the session from Stripe.
 */
async function onSessionPaidOrCompleted(
	deps: ServiceDeps,
	session: Stripe.Checkout.Session,
) {
	if (session.mode !== 'payment') return;
	const booking = await findSessionBooking(deps, session);
	if (!booking) {
		console.log(
			`Checkout Session ${session.id}: no booking (not ours), ignored`,
		);
		return;
	}
	if (session.payment_status === 'unpaid') {
		await markProcessing(deps, booking, session);
		return;
	}
	try {
		const outcome = await confirmBookingPayment(deps, booking.id, session.id);
		console.log(
			`Checkout Session ${session.id}: booking ${booking.confirmationId} ${outcome.status}`,
		);
	} catch (error) {
		// Verification failures are permanent: acknowledge, don't retry.
		if (error instanceof TRPCError && error.code !== 'INTERNAL_SERVER_ERROR') {
			console.warn(
				`Checkout Session ${session.id}: booking ${booking.confirmationId} not confirmed (${error.code})`,
			);
			return;
		}
		throw error;
	}
}

/** A delayed payment failed: release the hold and email the guest. */
async function onSessionPaymentFailed(
	deps: ServiceDeps,
	session: Stripe.Checkout.Session,
) {
	const booking = await findSessionBooking(deps, session);
	if (!booking || booking.stripeSessionId !== session.id) return;
	if (await releaseFailedPayment(deps, booking)) {
		console.log(
			`Checkout Session ${session.id}: payment failed, booking ${booking.confirmationId} released`,
		);
	}
}
