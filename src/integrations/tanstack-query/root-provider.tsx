import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Create singleton queryClient for the router
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5, // 5 minutes
		},
		mutations: {
			retry: 1,
		},
	},
});

export const trpc = createTRPCOptionsProxy<TRPCRouter>({
	client: trpcClient,
	queryClient,
});

export function getContext() {
	return {
		queryClient,
		trpc,
	};
}

export function Provider({
	children,
	queryClient,
}: {
	children: React.ReactNode;
	queryClient: QueryClient;
}) {
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
