// Auth config for schema generation NOT FOR PRODUCTION USE
// Better Auth CLI schema generation does not support D1 yet

import { stripe } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import Stripe from 'stripe';

const tempDatabase = drizzle({} as any); // Fake DB for CLI

// Initialize Stripe
export const stripeClient = new Stripe(
	import.meta.env.STRIPE_SECRET_KEY || '',
	{
		apiVersion: '2025-08-27.basil',
	},
);

// TEMPORARY AUTH CONFIG - for Better Auth CLI schema generation
export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET || 'temp-secret-for-cli',
	database: drizzleAdapter(tempDatabase, {
		provider: 'sqlite',
	}),
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	rateLimit: {
		enabled: true,
	},
	plugins: [
		admin(),
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				// Dummy implementation for CLI
				console.log(`Would send magic link to ${email}: ${url}`);
			},
		}),
		stripe({
			stripeClient,
			stripeWebhookSecret: import.meta.env.STRIPE_WEBHOOK_SECRET || '',
			createCustomerOnSignUp: true,
		}),
	],
});

// Helper for Cloudflare runtime (we'll use this later)
export const createDrizzle = (db: D1Database) => drizzle(db);
