import { auth } from '@/lib/auth';

import { createInnerTRPCContext } from './inner-context';

/**
 * Builds the tRPC context for one request. Shared by the HTTP handler
 * (`/api/trpc`) and the SSR `localLink` (src/integrations/trpc/client.ts).
 * Tests use `createInnerTRPCContext` with a synthetic session instead.
 * Server-only: never import this from client code.
 */
export async function createTRPCContext({ headers }: { headers: Headers }) {
	const authInstance = await auth();
	const session = await authInstance.api.getSession({ headers });
	return createInnerTRPCContext({ session, headers });
}
