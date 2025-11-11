import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { TRPCContext } from '@/integrations/trpc/init';
import { trpcRouter } from '@/integrations/trpc/router';
import { auth } from '@/lib/auth';

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
	// Fetch session from request headers (server-side)
	// This runs on every tRPC call and leverages Better Auth's built-in caching
	const authInstance = await auth();
	const session = await authInstance.api.getSession({
		headers: request.headers,
	});

	// Create tRPC context with session
	const context: TRPCContext = {
		db: env.DB,
		env: {
			STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
			STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY,
			STRIPE_TRPC_WEBHOOK_SECRET: env.STRIPE_TRPC_WEBHOOK_SECRET,
			BETTER_AUTH_URL: env.BETTER_AUTH_URL,
			RESEND_API_KEY: env.RESEND_API_KEY,
		},
		session,
		headers: request.headers,
	};

	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req: request,
		router: trpcRouter,
		createContext: () => context,
	});
}
