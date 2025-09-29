import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { TRPCContext } from '@/integrations/trpc/init';
import { trpcRouter } from '@/integrations/trpc/router';

// Server route for tRPC API
export const Route = createFileRoute('/api/trpc/$')({
	server: {
		handlers: {
			GET: ({ request }) => {
				return handleTRPCRequest(request);
			},
			POST: ({ request }) => {
				return handleTRPCRequest(request);
			},
		},
	},
});

async function handleTRPCRequest(request: Request): Promise<Response> {
	// Create tRPC context
	const context: TRPCContext = {
		db: env.DB,
		kv: env.KV_SESSIONS,
		env: {
			STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
			STRIPE_TRPC_WEBHOOK_SECRET: env.STRIPE_TRPC_WEBHOOK_SECRET,
			BETTER_AUTH_URL: env.BETTER_AUTH_URL,
			RESEND_API_KEY: env.RESEND_API_KEY,
		},
	};

	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req: request,
		router: trpcRouter,
		createContext: () => context,
	});
}
