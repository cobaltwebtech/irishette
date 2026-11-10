import { createMiddleware } from '@tanstack/react-start';
import {
	getRequestHeaders,
	setResponseHeader,
	setResponseStatus,
} from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';

import {
	actorKey,
	clientIp,
	isRateLimited,
	RATE_LIMIT_PERIOD_SECONDS,
	type RateLimiterName,
	tooManyRequestsResponse,
} from '@/lib/security/rate-limit';

/** Thrown by rateLimitFnMiddleware; the client sees this message. */
export const RATE_LIMITED_MESSAGE =
	'Too many requests. Please wait a minute and try again.';

/**
 * Server-function middleware: counts each call against a Cloudflare Rate
 * Limiting binding under `scope`, keyed by client IP. Over the limit: status
 * 429, the "rate-limited" log line, and an error with RATE_LIMITED_MESSAGE
 * (the handler does not run). Attach per function:
 *   createServerFn({ method: 'POST' })
 *     .middleware([rateLimitFnMiddleware('API_RATE_LIMITER', 'contact.submit')])
 */
export function rateLimitFnMiddleware(limiter: RateLimiterName, scope: string) {
	return createMiddleware({ type: 'function' }).server(async ({ next }) => {
		const ip = clientIp(getRequestHeaders());
		const key = actorKey(scope, { ip });
		if (await isRateLimited(env, limiter, key, { path: scope, ip })) {
			setResponseHeader('Retry-After', String(RATE_LIMIT_PERIOD_SECONDS));
			setResponseStatus(429);
			throw new Error(RATE_LIMITED_MESSAGE);
		}
		return next();
	});
}

/**
 * Server-route middleware: counts each request against a Cloudflare Rate
 * Limiting binding, keyed by client IP. Over the limit: 429 with Retry-After
 * and a "rate-limited" line in Workers Logs. Server routes only.
 */
export function rateLimitRequests(
	limiter: RateLimiterName,
	{ scope }: { scope: string },
) {
	return createMiddleware().server(async ({ request, pathname, next }) => {
		const ip = clientIp(request.headers);
		const key = actorKey(scope, { ip });
		if (await isRateLimited(env, limiter, key, { path: pathname, ip })) {
			return tooManyRequestsResponse();
		}
		return next();
	});
}
