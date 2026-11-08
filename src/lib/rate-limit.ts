// Cloudflare Rate Limiting bindings (cloudflare.config.ts) and the shared
// "rate-limited" log line. Server-only.
//
// The bindings are fast but approximate: counts are kept per Cloudflare
// location and synchronized in the background. They are a first filter in
// front of the endpoints; Better Auth keeps its own strict limits in D1 for
// the sign-in, sign-up and email endpoints (src/lib/auth.ts).
//
// Every rejected request writes one structured line to Workers Logs:
//   { "message": "rate-limited", "limiter", "path", "ipHash" }
// Query it in the Observability Query Builder (message = "rate-limited").
// The IP is never logged, only a keyed hash of it.

export type RateLimiterName =
	| 'AUTH_RATE_LIMITER'
	| 'API_RATE_LIMITER'
	| 'CSP_REPORT_RATE_LIMITER';

/** Window of every binding (cloudflare.config.ts `period`), for Retry-After. */
export const RATE_LIMIT_PERIOD_SECONDS = 60;

/** The client IP Cloudflare sets at the edge (clients cannot override it). */
export function clientIp(headers: Headers): string | null {
	return headers.get('cf-connecting-ip');
}

/** Rate-limit key for one actor: the user id when known, else the IP. */
export function actorKey(
	scope: string,
	actor: { userId?: string | null; ip: string | null },
): string {
	if (actor.userId) return `${scope}:user:${actor.userId}`;
	return `${scope}:ip:${actor.ip ?? 'unknown'}`;
}

/** Keyed hash of an IP for logs: stable per IP, not reversible without the secret. */
async function ipHash(ip: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(ip),
	);
	return [...new Uint8Array(mac).slice(0, 8)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Logs one rejected request to Workers Logs (no IP, no user data). */
export async function logRateLimited(
	env: Pick<Env, 'BETTER_AUTH_SECRET'>,
	details: { limiter: string; path: string; ip: string | null },
): Promise<void> {
	console.warn(
		JSON.stringify({
			message: 'rate-limited',
			limiter: details.limiter,
			path: details.path,
			ipHash: details.ip
				? await ipHash(details.ip, env.BETTER_AUTH_SECRET)
				: null,
		}),
	);
}

/**
 * Counts one request against `limiter` for `key`. Returns true (and logs)
 * when the request is over the limit. Fails open: a missing binding or a
 * binding error never blocks a request.
 */
export async function isRateLimited(
	env: Env,
	limiter: RateLimiterName,
	key: string,
	log: { path: string; ip: string | null },
): Promise<boolean> {
	const binding = env[limiter] as RateLimit | undefined;
	if (!binding) return false;
	let success: boolean;
	try {
		({ success } = await binding.limit({ key }));
	} catch (error) {
		console.error(
			`Rate limiter ${limiter} failed:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return false;
	}
	if (success) return false;
	await logRateLimited(env, { limiter, ...log });
	return true;
}

/** A plain 429 response with Retry-After. */
export function tooManyRequestsResponse(): Response {
	return Response.json(
		{ message: 'Too many requests. Please wait a minute and try again.' },
		{
			status: 429,
			headers: { 'Retry-After': String(RATE_LIMIT_PERIOD_SECONDS) },
		},
	);
}
