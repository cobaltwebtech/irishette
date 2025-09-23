import { createServerFileRoute } from '@tanstack/react-start/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { TRPCContext } from '@/integrations/trpc/init';
import { trpcRouter } from '@/integrations/trpc/router';
import { getBindings } from '@/utils/bindings';

// Server route for tRPC API
export const ServerRoute = createServerFileRoute('/api/trpc/$').methods({
	GET: ({ request }) => {
		return handleTRPCRequest(request);
	},
	POST: ({ request }) => {
		return handleTRPCRequest(request);
	},
});

async function handleTRPCRequest(request: Request): Promise<Response> {
	console.log('Using fetchRequestHandler - NEW VERSION');

	// Get the Cloudflare bindings
	const bindings = getBindings();

	// Create tRPC context
	const context: TRPCContext = {
		db: bindings.DB,
		kv: bindings.KV_SESSIONS,
	};

	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req: request,
		router: trpcRouter,
		createContext: () => context,
	});
}
