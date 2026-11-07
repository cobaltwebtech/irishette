import Stripe from 'stripe';

/**
 * Stripe API version this integration is written against. Pin it explicitly
 * instead of relying on the account default. Keep the sandbox webhook
 * endpoints on the same version.
 */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const;

/**
 * The single place a server-side Stripe client is created (Better Auth plugin,
 * PaymentService, webhooks). Server-only: never import from client code.
 */
export function createStripe(secretKey: string): Stripe {
	return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}
