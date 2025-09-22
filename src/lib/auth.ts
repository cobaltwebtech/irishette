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
import { getBindings } from '@/utils/bindings';

// Initialize Drizzle with the Cloudflare D1 database
export const createDrizzle = (db: D1Database) =>
	drizzle(db, { schema: authSchema });

// Create Better Auth instance using Cloudflare bindings
export const auth = () => {
	const env = getBindings();

	// Initialize Stripe with environment variables
	const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: '2025-08-27.basil',
	});

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
