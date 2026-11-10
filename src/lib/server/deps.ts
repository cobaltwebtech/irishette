import type Stripe from 'stripe';

import { createDrizzle, type Database } from '@/db/drizzle-init';
import { createStripe } from '@/lib/stripe/stripe';

/**
 * What server-side services need: the database, bindings, a Stripe client and
 * a way to finish work after the response (emails, alerts). The tRPC context
 * satisfies this; the webhook and cron handlers build one with
 * `createServiceDeps`. Server-only.
 */
export interface ServiceDeps {
	db: Database;
	env: Env;
	stripe: Stripe;
	waitUntil: (promise: Promise<unknown>) => void;
}

export function createServiceDeps(
	env: Env,
	waitUntil: (promise: Promise<unknown>) => void,
): ServiceDeps {
	return {
		db: createDrizzle(env.DB),
		env,
		stripe: createStripe(env.STRIPE_SECRET_KEY),
		waitUntil,
	};
}

/**
 * Runs `task` in the background and logs (never throws) on failure. For
 * best-effort side effects such as emails.
 */
export function inBackground(
	deps: Pick<ServiceDeps, 'waitUntil'>,
	label: string,
	task: () => Promise<unknown>,
) {
	deps.waitUntil(
		task().catch((error: unknown) => {
			console.error(
				`Background task failed (${label}):`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}),
	);
}
