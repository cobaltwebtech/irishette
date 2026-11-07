import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/integrations/trpc/context';
import { trpcRouter } from '@/integrations/trpc/router';

// Server route for tRPC over HTTP (browser calls). SSR calls the router
// in-process via localLink instead (src/integrations/trpc/client.ts).
export const Route = createFileRoute('/api/trpc/$')({
	server: {
		handlers: {
			GET: ({ request }) => handleTRPCRequest(request),
			POST: ({ request }) => handleTRPCRequest(request),
		},
	},
});

function handleTRPCRequest(request: Request): Promise<Response> {
	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req: request,
		router: trpcRouter,
		createContext: () => createTRPCContext({ headers: request.headers }),
		onError({ error, path, type }) {
			// Expected client errors (auth, validation, not found) are not logged.
			// No input or user data here: only the procedure path and the error.
			if (error.code === 'INTERNAL_SERVER_ERROR') {
				console.error(`tRPC ${type} ${path ?? '<unknown>'} failed:`, error);
			}
		},
	});
}
