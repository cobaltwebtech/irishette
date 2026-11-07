import { env, waitUntil } from 'cloudflare:workers';
import { createDrizzle } from '@/db/drizzle-init';
import { auth } from '@/lib/auth';

/**
 * Builds the tRPC context for one request. Shared by the HTTP handler
 * (`/api/trpc`), the SSR `localLink` (src/integrations/trpc/client.ts) and
 * tests. Server-only: never import this from client code.
 */
export async function createTRPCContext({ headers }: { headers: Headers }) {
	const authInstance = await auth();
	const session = await authInstance.api.getSession({ headers });

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

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
