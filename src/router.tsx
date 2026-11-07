import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { makeTRPCClient } from '@/integrations/trpc/client';
import { TRPCProvider } from '@/integrations/trpc/react';
import type { TRPCRouter } from '@/integrations/trpc/router';
import { routeTree } from './routeTree.gen';

/**
 * Called once per SSR request and once in the browser. Everything with state
 * (QueryClient, tRPC client) is created here, never at module scope, so one
 * request's cache can never be dehydrated into another user's page.
 */
export const getRouter = () => {
	const queryClient = new QueryClient({
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
		context: { queryClient, trpc, trpcClient },
		defaultPreload: 'intent',
		// Let TanStack Query own data freshness for preloads.
		defaultPreloadStaleTime: 0,
		// biome-ignore lint/correctness/noComponentHookFactories: Wrap must close over this router's per-request clients
		Wrap: ({ children }: { children: React.ReactNode }) => (
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		),
	});

	// Provides the QueryClientProvider and SSR dehydration/hydration.
	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
};
