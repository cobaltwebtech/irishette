import { env, waitUntil as workerWaitUntil } from 'cloudflare:workers';

import type { auth } from '@/lib/auth';
import { createServiceDeps } from '@/lib/deps';

type AuthInstance = Awaited<ReturnType<typeof auth>>;

/** Better Auth session as returned by `auth.api.getSession()`. */
export type AuthSession = Awaited<
	ReturnType<AuthInstance['api']['getSession']>
>;

/**
 * The request-independent part of the tRPC context: bindings, Drizzle, a
 * Stripe client and an already resolved session. `createTRPCContext`
 * (context.ts) resolves the session from request headers with Better Auth and
 * calls this; tests call it directly with a synthetic session (and their own
 * `waitUntil`), so they don't need Better Auth.
 * Server-only: never import this from client code.
 */
export function createInnerTRPCContext({
	session,
	headers = new Headers(),
	waitUntil = workerWaitUntil,
}: {
	session: AuthSession;
	headers?: Headers;
	waitUntil?: (promise: Promise<unknown>) => void;
}) {
	return {
		// db (Drizzle over env.DB), env, stripe, waitUntil
		...createServiceDeps(env, waitUntil),
		/** Better Auth session (server-side only; never returned to clients). */
		session,
		user: session?.user ?? null,
		headers,
	};
}

export type TRPCContext = ReturnType<typeof createInnerTRPCContext>;
