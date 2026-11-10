import {
	type QueryClient,
	queryOptions,
	useSuspenseQuery,
} from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';

import { getSessionFn } from '@/core/functions/auth-server';
import { isAuthError } from '@/integrations/trpc/errors';
import type { AppSession } from '@/lib/auth/session-user';

export type { AppSession } from '@/lib/auth/session-user';

const SESSION_QUERY_KEY = ['auth', 'session'] as const;

/**
 * Session query. The root route's beforeLoad loads it once per SSR request;
 * it is dehydrated into the page, so client navigations reuse the cache.
 */
export const sessionQueryOptions = () =>
	queryOptions({
		queryKey: SESSION_QUERY_KEY,
		queryFn: () => getSessionFn(),
		staleTime: 60_000,
	});

const FRESH_SESSION_QUERY_KEY = [...SESSION_QUERY_KEY, 'fresh'] as const;

/**
 * Session read from the database (bypasses Better Auth's 5-minute cookie
 * cache), for the admin layout guard. Its own cache entry, reused for 30
 * minutes in the browser: the real admin check runs on the server for every
 * admin tRPC call (adminProcedure), and a FORBIDDEN/UNAUTHORIZED answer
 * refreshes the session right away (createAuthErrorHandler).
 */
export const freshSessionQueryOptions = () =>
	queryOptions({
		queryKey: FRESH_SESSION_QUERY_KEY,
		queryFn: () => getSessionFn({ data: { fresh: true } }),
		staleTime: 30 * 60_000,
	});

/**
 * The database-fresh session for the admin guard (cached 30 minutes, see
 * freshSessionQueryOptions). When it was actually refetched, the shared
 * session key gets the result too, so useSession() and the guards agree.
 */
export async function fetchFreshSession(
	queryClient: QueryClient,
): Promise<AppSession> {
	const options = freshSessionQueryOptions();
	const before = queryClient.getQueryState(options.queryKey)?.dataUpdatedAt;
	const session = await queryClient.fetchQuery(options);
	const after = queryClient.getQueryState(options.queryKey)?.dataUpdatedAt;
	if (after !== before) queryClient.setQueryData(SESSION_QUERY_KEY, session);
	return session;
}

/** Current session (or null). Always resolved: the root route preloads it. */
export function useSession(): AppSession {
	return useSuspenseQuery(sessionQueryOptions()).data;
}

/**
 * Call after any auth action (sign-in, sign-up, sign-out, profile change):
 * refetches the session, then re-runs route guards and loaders.
 */
export async function refreshSession(
	queryClient: QueryClient,
	router: AnyRouter,
) {
	// Bypass Better Auth's cookie cache: after a profile change it may still
	// hold the old values for up to 5 minutes. Both cache entries get the
	// result, so the guards and useSession() agree.
	const session = await queryClient.fetchQuery({
		...freshSessionQueryOptions(),
		staleTime: 0,
	});
	queryClient.setQueryData(SESSION_QUERY_KEY, session);
	await router.invalidate();
}

/** Minimum time between two automatic session refreshes after auth errors. */
const AUTH_ERROR_REFRESH_INTERVAL_MS = 10_000;

/**
 * For the QueryClient's query and mutation caches (src/router.tsx): when a
 * tRPC call fails with UNAUTHORIZED or FORBIDDEN in the browser (session
 * expired, role revoked, account banned), refresh the session and re-run the
 * route guards, which redirect. At most once per 10 s, so a page whose
 * loaders keep failing cannot loop.
 */
export function createAuthErrorHandler(
	queryClient: QueryClient,
	getRouter: () => AnyRouter,
) {
	let lastRefreshAt = 0;
	return (error: unknown) => {
		if (typeof window === 'undefined' || !isAuthError(error)) return;
		const now = Date.now();
		if (now - lastRefreshAt < AUTH_ERROR_REFRESH_INTERVAL_MS) return;
		lastRefreshAt = now;
		refreshSession(queryClient, getRouter()).catch((refreshError: unknown) => {
			console.error(
				'Session refresh failed:',
				refreshError instanceof Error ? refreshError.message : 'Unknown error',
			);
		});
	};
}

/** Clears the cached session immediately (sign-out), then refreshes. */
export async function clearSession(
	queryClient: QueryClient,
	router: AnyRouter,
) {
	queryClient.setQueryData<AppSession>(SESSION_QUERY_KEY, null);
	// Drop every other cached query: it may hold the signed-out user's data.
	queryClient.removeQueries({
		predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
	});
	await refreshSession(queryClient, router);
}
