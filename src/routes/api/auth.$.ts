import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';

import { rateLimitRequests } from '@/core/middleware/rate-limit';
import { auth } from '@/lib/auth';
import { clientIp, logRateLimited } from '@/lib/rate-limit';

// Better Auth handler for all HTTP methods.
const authHandler = async ({ request }: { request: Request }) => {
	try {
		const authInstance = await auth();
		const response = await authInstance.handler(request);
		if (response.status === 429) {
			// Better Auth's own (strict, D1) limit; same log line as the bindings.
			await logRateLimited(env, {
				limiter: 'better-auth',
				path: new URL(request.url).pathname,
				ip: clientIp(request.headers),
			});
		}
		return response;
	} catch (error) {
		console.error('Error in auth handler:', error);
		return new Response('Auth error', { status: 500 });
	}
};

export const Route = createFileRoute('/api/auth/$')({
	server: {
		// Approximate per-IP filter in front of Better Auth's strict limits.
		middleware: [rateLimitRequests('AUTH_RATE_LIMITER', { scope: 'auth' })],
		handlers: {
			GET: authHandler,
			POST: authHandler,
			PUT: authHandler,
			DELETE: authHandler,
			PATCH: authHandler,
			OPTIONS: authHandler,
		},
	},
});
