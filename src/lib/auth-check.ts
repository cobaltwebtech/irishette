import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { DEFAULT_AUTH_REDIRECT, isSafeRedirect } from '@/lib/redirect';
import {
	type AppSession,
	fetchFreshSession,
	sessionQueryOptions,
} from '@/lib/session';
import type { SessionUser } from '@/lib/session-user';

// Route guards for `beforeLoad`. UX only: they decide which page to show.
// The real enforcement is on the server (tRPC protectedProcedure /
// adminProcedure, requireSessionMiddleware / requireAdminMiddleware for
// server functions, Better Auth itself).
//
// Sessions come from the per-request QueryClient in the router context
// (src/router.tsx) through getSessionFn: on the server during SSR, over RPC in
// the browser. Never use a module-level QueryClient (shared between requests
// and users on Workers) or fetch('/api/auth/...') (no cookies during SSR).

interface GuardContext {
	queryClient: QueryClient;
}

interface GuardArgs {
	context: GuardContext;
	location: { href: string };
}

/** The cached session (loaded once per SSR request by the root route). */
function cachedSession(context: GuardContext): Promise<AppSession> {
	return context.queryClient.ensureQueryData(sessionQueryOptions());
}

function toLogin(location: { href: string }): never {
	throw redirect({
		to: '/auth/login',
		search: { redirect: location.href },
	});
}

/** Signed-in pages: signed out -> /auth/login?redirect=<current href>. */
export async function requireAuth({
	context,
	location,
}: GuardArgs): Promise<SessionUser> {
	const session = await cachedSession(context);
	if (!session) toLogin(location);
	return session.user;
}

/**
 * Admin pages: reads the session without Better Auth's cookie cache (every
 * SSR load; at most every 30 minutes during client navigation). Signed out ->
 * login; signed in but not an admin -> `/` (login would bounce back: a loop).
 * A FORBIDDEN/UNAUTHORIZED tRPC answer refreshes the session and re-runs this
 * guard (createAuthErrorHandler in src/lib/session.ts).
 */
export async function requireAdmin({
	context,
	location,
}: GuardArgs): Promise<SessionUser> {
	const session = await fetchFreshSession(context.queryClient);
	if (!session) toLogin(location);
	if (session.user.role !== 'admin') throw redirect({ to: '/' });
	return session.user;
}

/** Pages that work either way: the session user or null, no redirect. */
export async function optionalAuth({
	context,
}: {
	context: GuardContext;
}): Promise<SessionUser | null> {
	return (await cachedSession(context))?.user ?? null;
}

/**
 * Auth pages (login, signup, password reset): a signed-in user goes on to
 * `search.redirect` when it is a safe same-origin path, else to
 * DEFAULT_AUTH_REDIRECT.
 */
export async function requireNoSession({
	context,
	search,
}: {
	context: GuardContext;
	search: { redirect?: string };
}): Promise<void> {
	const session = await cachedSession(context);
	if (!session) return;
	const target =
		search.redirect && isSafeRedirect(search.redirect)
			? search.redirect
			: DEFAULT_AUTH_REDIRECT;
	throw redirect({ href: target });
}

/**
 * After sign-in, sign-out or a profile change: refetch the session, then
 * re-run the guards and loaders (same function as refreshSession).
 */
export { refreshSession as invalidateSession } from '@/lib/session';
