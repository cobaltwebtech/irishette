import '@/lib/zod-config';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

import { makeTRPCClient } from '@/integrations/trpc/client';
import { TRPCProvider } from '@/integrations/trpc/react';
import type { TRPCRouter } from '@/integrations/trpc/router';
import { createAuthErrorHandler } from '@/lib/session';

import { routeTree } from './routeTree.gen';

/**
 * Called once per SSR request and once in the browser. Everything with state
 * (QueryClient, tRPC client) is created here, never at module scope, so one
 * request's cache can never be dehydrated into another user's page.
 */
export const getRouter = () => {
	// Browser only: an UNAUTHORIZED/FORBIDDEN tRPC answer refreshes the session
	// and re-runs the guards (see createAuthErrorHandler).
	const onAuthError = (error: unknown) => handleAuthError(error);
	const queryClient = new QueryClient({
		queryCache: new QueryCache({ onError: onAuthError }),
		mutationCache: new MutationCache({ onError: onAuthError }),
		defaultOptions: {
			queries: {
				staleTime: 60_000,
				retry: 1,
				refetchOnWindowFocus: false,
			},
		},
	});
	const trpcClient = makeTRPCClient();
	const trpc = createTRPCOptionsProxy<TRPCRouter>({
		client: trpcClient,
		queryClient,
	});

	const router = createRouter({
		routeTree,
		context: { queryClient, trpc },
		defaultPreload: 'intent',
		// Let TanStack Query own data freshness for preloads.
		defaultPreloadStaleTime: 0,
		// Wrap must close over this router's per-request clients (a component defined inside a function on purpose).
		Wrap: ({ children }: { children: React.ReactNode }) => (
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		),
	});

	const handleAuthError = createAuthErrorHandler(queryClient, () => router);

	// Provides the QueryClientProvider and SSR dehydration/hydration.
	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
};
