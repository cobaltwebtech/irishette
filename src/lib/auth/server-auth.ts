import { env } from 'cloudflare:workers';

import { createDrizzle, type Database } from '@/db/drizzle-init';
import { isActiveAdmin, isBanActive } from '@/integrations/trpc/access';
import type { AuthSession } from '@/integrations/trpc/inner-context';
import { auth } from '@/lib/auth/auth';
import { type SessionUser, toSessionUser } from '@/lib/auth/session-user';

// Server-side session checks for TanStack Start server functions (used by
// src/core/middleware/auth.ts and getSessionFn). The same rules as tRPC's
// protectedProcedure / adminProcedure. Server-only.

/**
 * Better Auth session for the request headers. `fresh` bypasses the 5-minute
 * cookie cache and reads the session from D1.
 */
export async function getAuthSession(
	headers: Headers,
	{ fresh = false }: { fresh?: boolean } = {},
): Promise<AuthSession> {
	const authInstance = await auth();
	return authInstance.api.getSession({
		headers,
		query: fresh ? { disableCookieCache: true } : undefined,
	});
}

/** A failed server function auth check, with the HTTP status to send. */
export class ServerFnAuthError extends Error {
	constructor(readonly status: 401 | 403) {
		super(status === 401 ? 'Unauthorized' : 'Forbidden');
		this.name = 'ServerFnAuthError';
	}
}

/**
 * Checks a resolved session for a server function:
 * - `'user'`: signed in and not banned (401 / 403), like protectedProcedure.
 * - `'admin'`: also an unbanned admin according to D1 (403), like
 *   adminProcedure, so a revoked role takes effect on the next call.
 * Returns the safe SessionUser shape.
 */
export async function authorizeSession(
	session: AuthSession,
	level: 'user' | 'admin',
	db: Database,
): Promise<SessionUser> {
	if (!session) throw new ServerFnAuthError(401);
	if (isBanActive(session.user)) throw new ServerFnAuthError(403);
	if (level === 'admin' && !(await isActiveAdmin(db, session.user.id))) {
		throw new ServerFnAuthError(403);
	}
	return toSessionUser(session.user);
}

/**
 * Resolves the session from the request headers and checks it (see
 * authorizeSession). Admin checks skip the cookie cache, so a ban or a
 * sign-out elsewhere applies at once.
 */
export async function authorizeRequest(
	headers: Headers,
	level: 'user' | 'admin',
): Promise<SessionUser> {
	const session = await getAuthSession(headers, { fresh: level === 'admin' });
	return authorizeSession(session, level, createDrizzle(env.DB));
}
