import {
	type QueryClient,
	queryOptions,
	useSuspenseQuery,
} from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';

import { type AppSession, getSessionFn } from '@/core/functions/auth-server';

export type { AppSession } from '@/core/functions/auth-server';

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

/** Fresh (no cookie cache) session for admin checks. Same cache entry. */
export const freshSessionQueryOptions = () =>
	queryOptions({
		queryKey: SESSION_QUERY_KEY,
		queryFn: () => getSessionFn({ data: { fresh: true } }),
		staleTime: 5_000,
	});

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
	// hold the old values for up to 5 minutes.
	await queryClient.fetchQuery({
		...freshSessionQueryOptions(),
		staleTime: 0,
	});
	await router.invalidate();
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
