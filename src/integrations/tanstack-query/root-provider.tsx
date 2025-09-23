import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { TRPCRouter } from '@/integrations/trpc/router';

function getUrl() {
	const base = (() => {
		if (typeof window !== 'undefined') return '';
		// In Cloudflare Workers, don't hardcode localhost port
		// TanStack Start will handle the base URL correctly
		return '';
	})();
	return `${base}/api/trpc`;
}

export const trpcClient = createTRPCClient<TRPCRouter>({
	links: [
		httpBatchLink({
			url: getUrl(),
			transformer: superjson,
		}),
	],
});

// Create singleton queryClient and trpc for direct import pattern
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

export const trpc = createTRPCOptionsProxy<TRPCRouter>({
	client: trpcClient,
	queryClient,
});

export function getContext() {
	// Return the same singleton instances to ensure consistency
	return {
		queryClient,
		trpc,
	};
}

export function Provider({
	children,
	queryClient: _queryClient,
}: {
	children: React.ReactNode;
	queryClient: QueryClient;
}) {
	return <>{children}</>;
}
