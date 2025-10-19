import { env } from 'cloudflare:workers';
import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, magicLink, phoneNumber } from 'better-auth/plugins';
import { reactStartCookies } from 'better-auth/react-start';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { MagicLinkEmail } from '@/components/email/MagicLinkEmail';
import { PasswordReset } from '@/components/email/PasswordReset';
import * as authSchema from '@/db/auth-schema';
// Initialize Drizzle with the Cloudflare D1 database
export const createDrizzle = (db: D1Database) =>
	drizzle(db, { schema: authSchema });

// Create Better Auth instance and connect to Cloudflare D1 database
export const auth = async () => {
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
			reactStartCookies(), // Handle cookies for TanStack Start
		],
	});
};

export type Auth = ReturnType<typeof auth>;
