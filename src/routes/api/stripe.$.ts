import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
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

// Server route for Stripe webhook
export const Route = createFileRoute('/api/stripe/$')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Check if this is the webhook endpoint
				const url = new URL(request.url);
				const pathname = url.pathname;

				if (pathname.endsWith('/webhook')) {
					return handleStripeWebhook(request);
				}

				return new Response('Not Found', { status: 404 });
			},
		},
	},
});

async function handleStripeWebhook(request: Request): Promise<Response> {
	console.log('Stripe webhook received');

	try {
		// Security: Verify Content-Type
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			console.error('Invalid content type:', contentType);
			return new Response('Invalid content type', { status: 400 });
		}

		// Security: Verify webhook signature (PRIMARY SECURITY MEASURE)
		// This cryptographically verifies the request is from Stripe
		const body = await request.text();
		const signature = request.headers.get('stripe-signature');

		if (!signature) {
			console.error(
				'Missing Stripe signature - possible unauthorized access attempt',
			);
			return new Response('Missing signature', { status: 400 });
		}

		// Initialize Stripe for webhook signature verification
		const stripe = new Stripe(env.STRIPE_SECRET_KEY);

		// Verify the webhook signature (CRITICAL: Prevents spoofing and replay attacks)
		// Stripe's signature includes timestamp to prevent replay attacks
		let event: Stripe.Event;
		try {
			event = await stripe.webhooks.constructEventAsync(
				body,
				signature,
				env.STRIPE_TRPC_WEBHOOK_SECRET,
			);
		} catch (err) {
			// Log signature verification failures - could indicate attack attempts
			console.error(
				'Webhook signature verification failed - possible spoofing attempt:',
				err,
			);
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
			DB: env.DB,
			STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
			STRIPE_TRPC_WEBHOOK_SECRET: env.STRIPE_TRPC_WEBHOOK_SECRET,
			BETTER_AUTH_URL: env.BETTER_AUTH_URL,
		});

		// Handle different event types
		switch (event.type) {
			case 'checkout.session.completed':
				// Handle legacy hosted checkout sessions
				console.log('Handling checkout.session.completed event');
				await handleCheckoutCompleted(event, paymentService);
				break;

			case 'checkout.session.expired':
				console.log('Handling checkout.session.expired event');
				await handleCheckoutExpired(event, paymentService);
				break;

			case 'payment_intent.succeeded':
				// Handle in-app checkout payment intents (PRIMARY EVENT)
				console.log(
					'Handling payment_intent.succeeded event (primary confirmation)',
				);
				await handlePaymentIntentSucceeded(event, paymentService);
				break;

			case 'payment_intent.payment_failed':
				console.log('Handling payment_intent.payment_failed event');
				await handlePaymentIntentFailed(event, paymentService);
				break;

			// Informational events - we don't need to process these
			case 'charge.succeeded':
			case 'charge.updated':
			case 'charge.failed':
				console.log(
					`Informational event received (no action needed): ${event.type}`,
				);
				// These are child events of payment_intent - already handled above
				break;

			case 'mandate.updated':
				console.log(
					'Mandate updated (saved payment method) - no action needed',
				);
				// Only relevant for subscriptions or saved payment methods
				break;

			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		return new Response('Webhook handled successfully', { status: 200 });
	} catch (error) {
		// Log detailed error for debugging, but don't expose details to caller
		console.error('Webhook processing error:', error);
		return new Response('Webhook processing error', { status: 500 });
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
					baseUrl: env.BETTER_AUTH_URL,
				};

				console.log('Email data prepared. Checking RESEND_API_KEY...');
				console.log('RESEND_API_KEY exists:', !!env.RESEND_API_KEY);

				console.log('Calling sendBookingConfirmationEmail...');
				const emailResult = await sendBookingConfirmationEmail(emailData, {
					RESEND_API_KEY: env.RESEND_API_KEY,
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

				// Send admin notification email with 2-second delay
				console.log('Starting admin notification email process...');
				try {
					// Wait 2 seconds to avoid Resend rate limit (2 requests/second)
					await new Promise((resolve) => setTimeout(resolve, 2000));

					// Get admin users
					const adminEmails = await getAdminUsers(env.DB);

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
							baseUrl: env.BETTER_AUTH_URL,
						};

						const adminEmailResult = await sendAdminBookingNotification(
							adminEmailData,
							adminEmails,
							{
								RESEND_API_KEY: env.RESEND_API_KEY,
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
 * Handle successful payment intent (in-app checkout)
 * This serves as a backup in case the frontend confirmPayment call fails
 */
async function handlePaymentIntentSucceeded(
	event: Stripe.Event,
	paymentService: PaymentService,
): Promise<void> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent;

	try {
		console.log('Processing payment intent succeeded:', paymentIntent.id);

		// Get booking by payment intent ID
		const bookingDetails = await paymentService.getBookingByPaymentIntent(
			paymentIntent.id,
		);

		if (!bookingDetails?.booking) {
			console.log('No booking found for payment intent:', paymentIntent.id);
			return;
		}

		const booking = bookingDetails.booking;

		// Check if booking is already confirmed (frontend call succeeded)
		if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
			console.log(
				'Booking already confirmed by frontend for payment intent:',
				paymentIntent.id,
				'- Skipping duplicate email sends',
			);
			// Booking already processed by frontend, no need to send emails again
			return;
		}

		// Booking not confirmed yet - webhook is acting as backup
		console.log(
			'Frontend confirmation may have failed, confirming via webhook for booking:',
			booking.id,
		);

		// Confirm the payment via PaymentService
		await paymentService.confirmPaymentIntent(booking.id, paymentIntent.id);

		console.log(
			'Booking confirmed via webhook for payment intent:',
			paymentIntent.id,
		);

		// Send confirmation emails (as backup)
		if (bookingDetails.room) {
			const emailData: BookingEmailData = {
				confirmationId: booking.confirmationId,
				guestName: booking.guestName,
				guestEmail: booking.guestEmail,
				guestPhone: booking.guestPhone || undefined,
				roomName: bookingDetails.room.name,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				numberOfNights: booking.numberOfNights,
				numberOfGuests: booking.numberOfGuests,
				specialRequests: booking.specialRequests || undefined,
				baseAmount: booking.baseAmount,
				taxAmount: booking.taxAmount || 0,
				feesAmount: booking.feesAmount || 0,
				totalAmount: booking.totalAmount,
				baseUrl: env.BETTER_AUTH_URL,
			};

			const emailResult = await sendBookingConfirmationEmail(emailData, {
				RESEND_API_KEY: env.RESEND_API_KEY,
			});

			if (emailResult.success) {
				console.log(
					'Backup confirmation email sent successfully for:',
					booking.confirmationId,
				);
			} else {
				console.error(
					'Failed to send backup confirmation email:',
					emailResult.error,
				);
			}

			// Send admin notification with 2-second delay to avoid rate limit
			try {
				// Wait 2 seconds to avoid Resend rate limit (2 requests/second)
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const adminEmails = await getAdminUsers(env.DB);

				if (adminEmails.length > 0) {
					const adminEmailData: AdminNotificationEmailData = {
						confirmationId: booking.confirmationId,
						guestName: booking.guestName,
						guestEmail: booking.guestEmail,
						guestPhone: booking.guestPhone || undefined,
						roomName: bookingDetails.room.name,
						checkInDate: booking.checkInDate,
						checkOutDate: booking.checkOutDate,
						numberOfNights: booking.numberOfNights,
						numberOfGuests: booking.numberOfGuests,
						specialRequests: booking.specialRequests || undefined,
						totalAmount: booking.totalAmount,
						baseUrl: env.BETTER_AUTH_URL,
					};

					const adminEmailResult = await sendAdminBookingNotification(
						adminEmailData,
						adminEmails,
						{
							RESEND_API_KEY: env.RESEND_API_KEY,
						},
					);

					if (adminEmailResult.success) {
						console.log(
							'Backup admin notification email sent successfully to:',
							adminEmails,
						);
					} else {
						console.error(
							'Failed to send backup admin notification email:',
							adminEmailResult.error,
						);
					}
				}
			} catch (adminEmailError) {
				console.error('Error in admin email sending process:', adminEmailError);
			}
		}
	} catch (error) {
		console.error('Failed to handle payment intent succeeded:', error);
		throw error;
	}
}

/**
 * Handle failed payment intents (in-app checkout)
 */
async function handlePaymentIntentFailed(
	event: Stripe.Event,
	paymentService: PaymentService,
): Promise<void> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent;

	try {
		console.log('Processing payment intent failure:', paymentIntent.id);

		// Get booking by payment intent ID
		const bookingDetails = await paymentService.getBookingByPaymentIntent(
			paymentIntent.id,
		);

		if (!bookingDetails?.booking) {
			console.log(
				'No booking found for failed payment intent:',
				paymentIntent.id,
			);
			return;
		}

		const booking = bookingDetails.booking;

		// Only update if booking is still pending
		if (booking.status === 'pending') {
			console.log(
				'Marking booking as cancelled due to payment failure:',
				booking.id,
			);

			// Note: You may want to add a method to PaymentService to handle this
			// For now, we just log it - the booking will remain pending and can be retried
			console.log(
				'Payment failed for booking:',
				booking.confirmationId,
				'Intent:',
				paymentIntent.id,
			);
		}
	} catch (error) {
		console.error('Failed to handle payment intent failure:', error);
		throw error;
	}
}
