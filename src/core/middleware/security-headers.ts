import { createMiddleware } from '@tanstack/react-start';

import {
	securityHeadersFor,
	withHeaders,
} from '@/lib/security/security-headers';

/**
 * Global request middleware (src/start.tsx): adds the security headers and
 * the report-only CSP to every response the Worker sends (SSR pages, server
 * routes, server functions). Static assets are served before the Worker runs.
 */
export const securityHeadersMiddleware = createMiddleware().server(
	async ({ request, next }) => {
		const result = await next();
		const headers = securityHeadersFor(new URL(request.url), {
			dev: import.meta.env.DEV,
		});
		return { ...result, response: withHeaders(result.response, headers) };
	},
);
