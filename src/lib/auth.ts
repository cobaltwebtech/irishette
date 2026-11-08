import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { admin, captcha, magicLink, phoneNumber } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { env } from 'cloudflare:workers';

import { createDrizzle } from '@/db/drizzle-init';
import {
	sendChangeEmailConfirmation,
	sendMagicLinkEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from '@/lib/email-service';
import { newId, newPublicId } from '@/lib/ids';
import { createStripe } from '@/lib/stripe';

// Built once per isolate: Better Auth 1.7 validates its schema on creation and
// caches per instance, so rebuilding it on every call repeats that work.
let authInstance: ReturnType<typeof createAuth> | undefined;

// Create Better Auth instance and connect to Cloudflare D1 database
export const auth = async () => {
	authInstance ??= createAuth();
	return authInstance;
};

function createAuth() {
	// Initialize Stripe with environment variables
	const stripeClient = createStripe(env.STRIPE_SECRET_KEY);

	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		database: drizzleAdapter(createDrizzle(env.DB), {
			provider: 'sqlite',
		}),
		session: {
			expiresIn: 60 * 60 * 24 * 7, // Session expires in 7 days
			updateAge: 60 * 60 * 24, // Every 24 hours the session expiration is updated
			cookieCache: {
				enabled: true,
				maxAge: 60 * 5, // Cache session data for 5 minutes
			},
		},
		rateLimit: {
			enabled: true,
		},
		advanced: {
			database: {
				// UUIDv7 primary keys for all Better Auth tables.
				generateId: () => newId(),
			},
			ipAddress: {
				// Cloudflare specific header for rate limiting
				ipAddressHeaders: ['cf-connecting-ip'],
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			sendResetPassword: ({ user, url }) =>
				sendPasswordResetEmail(env, user.email, url),
		},
		// Sign-up asks users to verify their address (the sign-up page says an
		// email was sent), and email changes are verified too.
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: ({ user, url }) =>
				sendVerificationEmail(env, user.email, url),
		},
		user: {
			additionalFields: {
				// Public id for URLs (column user.public_id, see auth-schema.ts).
				publicId: {
					type: 'string',
					required: true,
					input: false,
					defaultValue: () => newPublicId(),
				},
			},
			changeEmail: {
				enabled: true,
				// Verified users approve the change from their current address;
				// the new address is then verified too.
				sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
					sendChangeEmailConfirmation(env, user.email, newEmail, url),
			},
		},
		plugins: [
			admin(),
			magicLink({
				sendMagicLink: ({ email, url }) => sendMagicLinkEmail(env, email, url),
			}),
			phoneNumber(),
			stripe({
				stripeClient,
				stripeWebhookSecret: env.STRIPE_BETTER_AUTH_WEBHOOK_SECRET,
				createCustomerOnSignUp: true,
			}),
			captcha({
				provider: 'cloudflare-turnstile',
				secretKey: env.TURNSTILE_SECRET_KEY,
				endpoints: [
					'/sign-in/magic-link',
					'/sign-up/email',
					'/sign-in/email',
					'/request-password-reset',
				],
			}),
			tanstackStartCookies(), // Handle cookies for TanStack Start. Needs to be last in array.
		],
	});
}
