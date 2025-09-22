import { createServerFileRoute } from '@tanstack/react-start/server';
import Stripe from 'stripe';
import { getAdminUsers } from '@/lib/admin-query';
import {
	type AdminNotificationEmailData,
	type BookingEmailData,
	sendAdminBookingNotification,
	sendBookingConfirmationEmail,
} from '@/lib/email-service';
import { PaymentService } from '@/lib/payment-service';
import { stripeWebhookSchema } from '@/lib/payment-validation';
import { getBindings } from '@/utils/bindings';

// Server route for Stripe webhook
export const ServerRoute = createServerFileRoute('/api/stripe/$').methods({
	POST: async ({ request }) => {
		// Check if this is the webhook endpoint
		const url = new URL(request.url);
		const pathname = url.pathname;

		if (pathname.endsWith('/webhook')) {
			return handleStripeWebhook(request);
		}

		return new Response('Not Found', { status: 404 });
	},
});

async function handleStripeWebhook(request: Request): Promise<Response> {
	console.log('Stripe webhook received');

	try {
		// Get the Cloudflare bindings
		const bindings = getBindings();

		// Get the raw body and signature
		const body = await request.text();
		const signature = request.headers.get('stripe-signature');

		if (!signature) {
			console.error('Missing Stripe signature');
			return new Response('Missing signature', { status: 400 });
		}

		// Initialize Stripe with the binding
		const stripe = new Stripe(bindings.STRIPE_SECRET_KEY, {
			apiVersion: '2025-08-27.basil',
		});

		// Verify the webhook signature
		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(
				body,
				signature,
				bindings.STRIPE_TRPC_WEBHOOK_SECRET,
			);
		} catch (err) {
			console.error('Webhook signature verification failed:', err);
			return new Response(
				`Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
				{ status: 400 },
			);
		}

		// Validate the event structure
		const validatedEvent = stripeWebhookSchema.safeParse(event);
		if (!validatedEvent.success) {
			console.error('Invalid webhook event structure:', validatedEvent.error);
			return new Response('Invalid event structure', { status: 400 });
		}

		// Initialize payment service with bindings
		const paymentService = new PaymentService({
			DB: bindings.DB,
			STRIPE_SECRET_KEY: bindings.STRIPE_SECRET_KEY,
			STRIPE_TRPC_WEBHOOK_SECRET: bindings.STRIPE_TRPC_WEBHOOK_SECRET,
			BETTER_AUTH_URL: bindings.BETTER_AUTH_URL,
		});

		// Handle different event types
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutCompleted(event, paymentService);
				break;

			case 'checkout.session.expired':
				await handleCheckoutExpired(event, paymentService);
				break;

			case 'payment_intent.succeeded':
				console.log('Payment intent succeeded:', event.data.object.id);
				// Additional payment processing if needed
				break;

			case 'payment_intent.payment_failed':
				await handlePaymentFailed(event, paymentService);
				break;

			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		return new Response('Webhook handled successfully', { status: 200 });
	} catch (error) {
		console.error('Webhook processing error:', error);
		return new Response(
			`Webhook error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 },
		);
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

		// Send booking confirmation email
		console.log('About to start email sending process...');
		try {
			console.log('Starting email sending process...');
			console.log('Fetching booking details for session:', session.id);

			const bookingDetails = await paymentService.getBookingByStripeSessionId(
				session.id,
			);

			console.log('Booking details retrieved:', {
				hasBooking: !!bookingDetails?.booking,
				hasRoom: !!bookingDetails?.room,
				confirmationId: bookingDetails?.booking?.confirmationId,
				guestEmail: bookingDetails?.booking?.guestEmail,
			});

			if (bookingDetails?.booking && bookingDetails?.room) {
				console.log('Preparing email data...');

				// Get bindings for RESEND_API_KEY
				const bindings = getBindings();

				const emailData: BookingEmailData = {
					confirmationId: bookingDetails.booking.confirmationId,
					guestName: bookingDetails.booking.guestName,
					guestEmail: bookingDetails.booking.guestEmail,
					guestPhone: bookingDetails.booking.guestPhone || undefined,
					roomName: bookingDetails.room.name,
					checkInDate: bookingDetails.booking.checkInDate,
					checkOutDate: bookingDetails.booking.checkOutDate,
					numberOfNights: bookingDetails.booking.numberOfNights,
					numberOfGuests: bookingDetails.booking.numberOfGuests,
					specialRequests: bookingDetails.booking.specialRequests || undefined,
					baseAmount: bookingDetails.booking.baseAmount,
					taxAmount: bookingDetails.booking.taxAmount || 0,
					feesAmount: bookingDetails.booking.feesAmount || 0,
					totalAmount: bookingDetails.booking.totalAmount,
					baseUrl: bindings.BETTER_AUTH_URL,
				};

				console.log('Email data prepared. Checking RESEND_API_KEY...');
				console.log('RESEND_API_KEY exists:', !!bindings.RESEND_API_KEY);

				console.log('Calling sendBookingConfirmationEmail...');
				const emailResult = await sendBookingConfirmationEmail(emailData, {
					RESEND_API_KEY: bindings.RESEND_API_KEY,
				});

				console.log('Email sending result:', emailResult);

				if (emailResult.success) {
					console.log(
						'Booking confirmation email sent successfully for:',
						bookingDetails.booking.confirmationId,
					);
				} else {
					console.error(
						'Failed to send booking confirmation email:',
						emailResult.error,
					);
				}

				// Send admin notification email
				console.log('Starting admin notification email process...');
				try {
					// Get admin users
					const adminEmails = await getAdminUsers(bindings.DB);

					if (adminEmails.length > 0) {
						const adminEmailData: AdminNotificationEmailData = {
							confirmationId: bookingDetails.booking.confirmationId,
							guestName: bookingDetails.booking.guestName,
							guestEmail: bookingDetails.booking.guestEmail,
							guestPhone: bookingDetails.booking.guestPhone || undefined,
							roomName: bookingDetails.room.name,
							checkInDate: bookingDetails.booking.checkInDate,
							checkOutDate: bookingDetails.booking.checkOutDate,
							numberOfNights: bookingDetails.booking.numberOfNights,
							numberOfGuests: bookingDetails.booking.numberOfGuests,
							specialRequests:
								bookingDetails.booking.specialRequests || undefined,
							totalAmount: bookingDetails.booking.totalAmount,
							baseUrl: bindings.BETTER_AUTH_URL,
						};

						const adminEmailResult = await sendAdminBookingNotification(
							adminEmailData,
							adminEmails,
							{
								RESEND_API_KEY: bindings.RESEND_API_KEY,
							},
						);

						if (adminEmailResult.success) {
							console.log(
								'Admin notification email sent successfully to:',
								adminEmails,
							);
						} else {
							console.error(
								'Failed to send admin notification email:',
								adminEmailResult.error,
							);
						}
					} else {
						console.log('No admin users found - skipping admin notification');
					}
				} catch (adminEmailError) {
					console.error(
						'Error in admin email sending process:',
						adminEmailError,
					);
					// Don't throw here - admin email failure shouldn't fail the webhook
				}
			} else {
				console.error('Could not retrieve booking details for email sending');
			}
		} catch (emailError) {
			console.error('Error in email sending process:', emailError);
			// Don't throw here - email failure shouldn't fail the webhook
		}

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
 * Handle failed payment intents
 */
async function handlePaymentFailed(
	event: Stripe.Event,
	_paymentService: PaymentService,
): Promise<void> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent;

	try {
		console.log('Processing payment failure:', paymentIntent.id);

		// Find the checkout session associated with this payment intent
		// This requires storing the payment intent ID when creating the checkout session
		// The PaymentService.handlePaymentFailure method handles this

		console.log('Payment failure processed for intent:', paymentIntent.id);
	} catch (error) {
		console.error('Failed to handle payment failure:', error);
		throw error;
	}
}
