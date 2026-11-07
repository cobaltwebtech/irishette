import { env } from 'cloudflare:workers';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { admin, captcha, magicLink, phoneNumber } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import { MagicLinkEmail } from '@/components/email/MagicLinkEmail';
import { PasswordReset } from '@/components/email/PasswordReset';
import * as authSchema from '@/db/auth-schema';
import { newId, newPublicId } from '@/lib/ids';
import { createStripe } from '@/lib/stripe';

// Initialize Drizzle with the Cloudflare D1 database
export const createDrizzle = (db: D1Database) =>
	drizzle(db, { schema: authSchema });

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

	// Initialize Resend for email service
	const resend = new Resend(env.RESEND_API_KEY);

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
			sendResetPassword: async ({ user, url }) => {
				try {
					await resend.emails.send({
						from: 'Irishette <auth@contact.cobaltweb.tech>',
						to: user.email,
						subject: 'Password Reset',
						react: await PasswordReset({
							url: url,
						}),
					});
				} catch (error) {
					console.error('Error sending password reset:', error);
					throw error;
				}
			},
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
			},
		},
		plugins: [
			admin(),
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					try {
						console.log('Attempting to send magic link email to:', email);
						await resend.emails.send({
							from: 'Irishette <auth@contact.cobaltweb.tech>',
							to: email,
							subject: 'Login to Irishette',
							react: await MagicLinkEmail({
								url: url,
							}),
						});
						console.log('Magic link email sent successfully');
					} catch (error) {
						console.error('Error sending magic link email:', error);
						throw error;
					}
				},
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

export type Auth = ReturnType<typeof auth>;
