import { createMiddleware } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import {
	actorKey,
	clientIp,
	isRateLimited,
	type RateLimiterName,
	tooManyRequestsResponse,
} from '@/lib/rate-limit';

/**
 * Server-route middleware: counts each request against a Cloudflare Rate
 * Limiting binding, keyed by client IP. Over the limit: 429 with Retry-After
 * and a "rate-limited" line in Workers Logs. `skip` exempts paths (e.g. a
 * webhook that Stripe calls from shared IPs). Server routes only.
 */
export function rateLimitRequests(
	limiter: RateLimiterName,
	{ scope, skip }: { scope: string; skip?: (pathname: string) => boolean },
) {
	return createMiddleware().server(async ({ request, pathname, next }) => {
		if (skip?.(pathname)) return next();
		const ip = clientIp(request.headers);
		const key = actorKey(scope, { ip });
		if (await isRateLimited(env, limiter, key, { path: pathname, ip })) {
			return tooManyRequestsResponse();
		}
		return next();
	});
}
