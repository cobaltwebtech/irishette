import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { admin, captcha, magicLink } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { env } from 'cloudflare:workers';

import { createDrizzle } from '@/db/drizzle-init';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	MAGIC_LINK_EXPIRES_IN,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-constants';
import {
	sendChangeEmailConfirmation,
	sendMagicLinkEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from '@/lib/email-service';
import { newId, newPublicId } from '@/lib/ids';
import { createStripe } from '@/lib/stripe';

/**
 * Better Auth limits (window in seconds) for the endpoints that send email or
 * check a password. Other auth paths keep Better Auth's defaults
 * (100 requests per 10 s).
 */
export const AUTH_RATE_LIMIT_RULES = {
	'/sign-in/email': { window: 60, max: 5 },
	'/sign-in/magic-link': { window: 60, max: 3 },
	'/sign-up/email': { window: 60, max: 3 },
	'/request-password-reset': { window: 300, max: 3 },
	'/reset-password': { window: 300, max: 5 },
	'/send-verification-email': { window: 300, max: 3 },
} as const;

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
		// Strict limits in D1 (table rate_limit), the same in every isolate and
		// location; Better Auth prunes old rows itself. Keyed by client IP
		// (cf-connecting-ip) + path. The Cloudflare AUTH_RATE_LIMITER binding in
		// front of /api/auth/* is a cheaper, approximate first filter.
		rateLimit: {
			enabled: true,
			storage: 'database',
			customRules: AUTH_RATE_LIMIT_RULES,
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
			resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN,
			sendResetPassword: ({ user, url }) =>
				sendPasswordResetEmail(env, user.email, url),
		},
		// Sign-up asks users to verify their address (the sign-up page says an
		// email was sent), and email changes are verified too.
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
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
				// Optional, unique (column user.phone_number). input: false keeps
				// it out of Better Auth's sign-up and update-user bodies, so it
				// only changes through tRPC users.updateProfile (validated,
				// duplicate -> CONFLICT).
				phoneNumber: {
					type: 'string',
					required: false,
					unique: true,
					input: false,
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
				expiresIn: MAGIC_LINK_EXPIRES_IN,
				sendMagicLink: ({ email, url }) => sendMagicLinkEmail(env, email, url),
			}),
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
					'/send-verification-email',
				],
			}),
			tanstackStartCookies(), // Handle cookies for TanStack Start. Needs to be last in array.
		],
	});
}
