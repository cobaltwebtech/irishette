import Stripe from 'stripe';
import { PaymentService } from '@/lib/payment-service';

interface WebhookEnv {
	DB: D1Database;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	BETTER_AUTH_URL: string;
}

/**
 * Stripe webhook handler for Cloudflare Workers
 * Handles payment lifecycle events from Stripe
 */
export async function handleStripeWebhook(
	request: Request,
	env: WebhookEnv,
): Promise<Response> {
	try {
		// Initialize Stripe
		const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2025-08-27.basil',
		});

		// Get raw body and signature
		const body = await request.text();
		const signature = request.headers.get('stripe-signature');

		if (!signature) {
			return new Response('Missing stripe-signature header', { status: 400 });
		}

		// Verify webhook signature
		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(
				body,
				signature,
				env.STRIPE_WEBHOOK_SECRET,
			);
		} catch (err) {
			console.error('Webhook signature verification failed:', err);
			return new Response('Invalid signature', { status: 400 });
		}

		// Initialize payment service
		const paymentService = new PaymentService(env);

		// Handle different event types
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutCompleted(event, paymentService);
				break;

			case 'checkout.session.expired':
				await handleCheckoutExpired(event, paymentService);
				break;

			case 'payment_intent.succeeded':
				await handlePaymentSucceeded(event, paymentService);
				break;

			case 'payment_intent.payment_failed':
				await handlePaymentFailed(event, paymentService);
				break;

			case 'invoice.payment_succeeded':
				// Handle subscription payments if needed in the future
				console.log('Invoice payment succeeded:', event.data.object.id);
				break;

			case 'customer.subscription.created':
			case 'customer.subscription.updated':
			case 'customer.subscription.deleted':
				// Handle subscription events if needed in the future
				console.log('Subscription event:', event.type, event.data.object.id);
				break;

			default:
				console.log('Unhandled event type:', event.type);
		}

		return new Response('Webhook handled successfully', { status: 200 });
	} catch (error) {
		console.error('Webhook error:', error);
		return new Response('Webhook handler error', { status: 500 });
	}
}

/**
 * Handle successful checkout session completion
 */
async function handleCheckoutCompleted(
	event: Stripe.Event,
	paymentService: PaymentService,
): Promise<void> {
	const session = event.data.object as Stripe.Checkout.Session;

	try {
		console.log('Processing checkout completion:', session.id);

		await paymentService.confirmBookingPayment(session.id);

		console.log('Booking payment confirmed for session:', session.id);

		// TODO: Send booking confirmation email
		// TODO: Update room availability
		// TODO: Trigger other post-booking workflows
	} catch (error) {
		console.error('Failed to confirm booking payment:', error);
		throw error;
	}
}

/**
 * Handle expired checkout sessions
 */
async function handleCheckoutExpired(
	event: Stripe.Event,
	paymentService: PaymentService,
): Promise<void> {
	const session = event.data.object as Stripe.Checkout.Session;

	try {
		console.log('Processing checkout expiration:', session.id);

		await paymentService.handlePaymentFailure(session.id);

		console.log('Booking cancelled for expired session:', session.id);
	} catch (error) {
		console.error('Failed to handle checkout expiration:', error);
		throw error;
	}
}

/**
 * Handle successful payment intent
 */
async function handlePaymentSucceeded(
	event: Stripe.Event,
	_paymentService: PaymentService,
): Promise<void> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent;

	try {
		console.log('Payment intent succeeded:', paymentIntent.id);

		// Additional processing if needed beyond checkout completion
		// This is mainly for direct payment intents not going through checkout
		// Payment service would be used here if we need additional processing
	} catch (error) {
		console.error('Failed to handle payment success:', error);
		throw error;
	}
}

/**
 * Handle failed payment intent
 */
async function handlePaymentFailed(
	event: Stripe.Event,
	_paymentService: PaymentService,
): Promise<void> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent;

	try {
		console.log('Payment intent failed:', paymentIntent.id);

		// Handle payment failure - maybe retry logic or notification
		// Payment service would be used here if we need to update booking status
	} catch (error) {
		console.error('Failed to handle payment failure:', error);
		throw error;
	}
}

/**
 * Test webhook endpoint handler
 * Useful for verifying webhook setup without processing real events
 */
export async function handleWebhookTest(request: Request): Promise<Response> {
	try {
		const body = await request.json();
		console.log('Webhook test received:', body);

		return new Response(
			JSON.stringify({
				status: 'success',
				message: 'Webhook test received',
				timestamp: new Date().toISOString(),
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	} catch (error) {
		console.error('Webhook test error:', error);
		return new Response('Webhook test error', { status: 500 });
	}
}
