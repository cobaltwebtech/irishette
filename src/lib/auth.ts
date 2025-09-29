import { env } from 'cloudflare:workers';
import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, magicLink } from 'better-auth/plugins';
import { reactStartCookies } from 'better-auth/react-start';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { MagicLinkEmail } from '@/components/email/MagicLinkEmail';
import * as authSchema from '@/db/auth-schema';
// Initialize Drizzle with the Cloudflare D1 database
export const createDrizzle = (db: D1Database) =>
	drizzle(db, { schema: authSchema });

// Create Better Auth instance using Cloudflare bindings
export const auth = async () => {
	// const env = await initializeBindings();
	console.log('Auth - Using bindings:', {
		hasDB:
			!!env.DB && typeof env.DB === 'object' && Object.keys(env.DB).length > 0,
		authUrl: env.BETTER_AUTH_URL,
		hasStripeKey: !!env.STRIPE_SECRET_KEY,
		hasResendKey: !!env.RESEND_API_KEY,
	});

	// Initialize Stripe with environment variables
	const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: '2025-08-27.basil',
	});

	// Initialize Resend for email service
	const resend = new Resend(env.RESEND_API_KEY);

	// For development, use a simpler configuration without database
	if (import.meta.env.DEV && (!env.DB || Object.keys(env.DB).length === 0)) {
		console.warn(
			'Running in dev mode without D1 database - using memory storage',
		);
		return betterAuth({
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_URL,
			// No database adapter for development
			plugins: [
				admin(),
				magicLink({
					sendMagicLink: async ({ email, url }) => {
						console.log('DEV: Magic link for', email, ':', url);
						// Don't send emails in development
					},
				}),
				stripe({
					stripeClient,
					stripeWebhookSecret: env.STRIPE_BETTER_AUTH_WEBHOOK_SECRET,
					createCustomerOnSignUp: true,
				}),
				reactStartCookies(),
			],
		});
	}

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
			ipAddress: {
				// Cloudflare specific header for rate limiting
				ipAddressHeaders: ['cf-connecting-ip'],
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
			stripe({
				stripeClient,
				stripeWebhookSecret: env.STRIPE_BETTER_AUTH_WEBHOOK_SECRET,
				createCustomerOnSignUp: true,
			}),
			reactStartCookies(), // Handle cookies for TanStack Start
		],
	});
};

export type Auth = ReturnType<typeof auth>;
