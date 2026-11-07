import { env, waitUntil } from 'cloudflare:workers';
import { createDrizzle } from '@/db/drizzle-init';
import type { auth } from '@/lib/auth';

type AuthInstance = Awaited<ReturnType<typeof auth>>;

/** Better Auth session as returned by `auth.api.getSession()`. */
export type AuthSession = Awaited<
	ReturnType<AuthInstance['api']['getSession']>
>;

/**
 * The request-independent part of the tRPC context: bindings, Drizzle and an
 * already resolved session. `createTRPCContext` (context.ts) resolves the
 * session from request headers with Better Auth and calls this; tests call it
 * directly with a synthetic session, so they don't need Better Auth.
 * Server-only: never import this from client code.
 */
export function createInnerTRPCContext({
	session,
	headers = new Headers(),
}: {
	session: AuthSession;
	headers?: Headers;
}) {
	return {
		/** Drizzle instance over the D1 binding. Raw D1 is `env.DB`. */
		db: createDrizzle(env.DB),
		env,
		/** Better Auth session (server-side only; never returned to clients). */
		session,
		user: session?.user ?? null,
		headers,
		waitUntil,
	};
}

export type TRPCContext = ReturnType<typeof createInnerTRPCContext>;
