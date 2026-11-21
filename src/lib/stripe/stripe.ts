import Stripe from 'stripe';

/**
 * Stripe API version this integration is written against. Pin it explicitly
 * instead of relying on the account default. Keep the sandbox webhook
 * endpoints on the same version.
 */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const;

/**
 * The single place a server-side Stripe client is created (Better Auth plugin,
 * booking service, webhooks). Server-only: never import from client code.
 */
export function createStripe(secretKey: string): Stripe {
	return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

/** Marks Stripe objects the app created (refunds: app vs Dashboard). */
export const STRIPE_METADATA_SOURCE = 'irishette';

/**
 * Metadata linking a Stripe object (Checkout Session, PaymentIntent, refund)
 * to our booking, so any event can be traced back. Ids only: never guest
 * names, emails or phone numbers.
 */
export function stripeBookingMetadata(booking: {
	id: string;
	publicId: string;
	confirmationId: string;
}): Record<
	'bookingId' | 'bookingPublicId' | 'confirmationId' | 'source',
	string
> {
	return {
		bookingId: booking.id,
		bookingPublicId: booking.publicId,
		confirmationId: booking.confirmationId,
		source: STRIPE_METADATA_SOURCE,
	};
}

/**
 * Stripe refused the request for good (invalid request, card error), as
 * opposed to a transient API, rate-limit or network error worth retrying.
 */
export function isPermanentStripeError(error: unknown) {
	if (typeof error !== 'object' || error === null || !('type' in error)) {
		return false;
	}
	const { type } = error as { type: unknown };
	return type === 'StripeInvalidRequestError' || type === 'StripeCardError';
}

/** Stripe still saw another request with the same idempotency key running. */
export function isConcurrentRequestError(error: unknown) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'statusCode' in error &&
		(error as { statusCode: unknown }).statusCode === 409
	);
}

/**
 * After a capture got that 409 (the return page and the webhook capture the
 * same intent with the same key at once, and stripe-node's own retries ran
 * out first): the intent once the other request has settled it, or null if
 * it is still uncaptured after about 5 s.
 */
export async function intentAfterConcurrentCapture(
	stripe: Stripe,
	intentId: string,
	params: Stripe.PaymentIntentRetrieveParams = {},
): Promise<Stripe.PaymentIntent | null> {
	for (let attempt = 0; attempt < 5; attempt++) {
		if (attempt > 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		const intent = await stripe.paymentIntents.retrieve(intentId, params);
		if (intent.status !== 'requires_capture') return intent;
	}
	return null;
}

/** Dollars to Stripe's minor units (USD cents). */
export const toCents = (amount: number) => Math.round(amount * 100);

/** The id of an expandable Stripe field (string or expanded object). */
export function stripeId(
	value: string | { id: string } | null | undefined,
): string | null {
	if (!value) return null;
	return typeof value === 'string' ? value : value.id;
}
