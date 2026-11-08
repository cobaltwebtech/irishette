// Security headers for every Worker response (src/start.tsx request
// middleware). Pure.
//
// The Content Security Policy is sent as Content-Security-Policy-Report-Only
// (plan 02, 1.5): browsers report violations to /api/csp-report (logged to
// Workers Logs) but block nothing. Switch to the enforcing header only after
// the booking, payment (including Link), auth and admin flows were tested.
//
// Sources: Stripe.js and Payment Element (docs.stripe.com/security/guide),
// Turnstile (challenges.cloudflare.com), Cloudinary images, Iconify icons
// (fetched at runtime by @iconify/react) and the Bunny font CSS that the
// Stripe Payment Element loads.
// TanStack Start inlines its hydration scripts, hence 'unsafe-inline' in
// script-src. Follow-up before enforcing: per-request nonces.

export const CSP_REPORT_PATH = '/api/csp-report';
const CSP_REPORT_GROUP = 'csp-endpoint';

const STRIPE_JS = ['https://js.stripe.com', 'https://*.js.stripe.com'];
const TURNSTILE = 'https://challenges.cloudflare.com';
const ICONIFY = [
	'https://api.iconify.design',
	'https://api.simplesvg.com',
	'https://api.unisvg.com',
];

/** The CSP directives, joined into one header value. */
export function contentSecurityPolicy({ dev = false } = {}): string {
	const directives: Record<string, string[]> = {
		'default-src': ["'self'"],
		'script-src': ["'self'", "'unsafe-inline'", ...STRIPE_JS, TURNSTILE],
		'style-src': ["'self'", "'unsafe-inline'"],
		'img-src': [
			"'self'",
			'data:',
			'blob:',
			'https://res.cloudinary.com',
			'https://*.stripe.com',
		],
		'font-src': ["'self'", 'data:'],
		'connect-src': [
			"'self'",
			'https://api.stripe.com',
			'https://fonts.bunny.net',
			TURNSTILE,
			...ICONIFY,
			// Vite's dev server (HMR) talks over a WebSocket.
			...(dev ? ['ws:', 'wss:'] : []),
		],
		'frame-src': [...STRIPE_JS, 'https://hooks.stripe.com', TURNSTILE],
		'frame-ancestors': ["'none'"],
		'base-uri': ["'self'"],
		'form-action': ["'self'"],
		'object-src': ["'none'"],
		'report-uri': [CSP_REPORT_PATH],
		'report-to': [CSP_REPORT_GROUP],
	};
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.join(' ')}`)
		.join('; ');
}

/** Path prefixes whose responses are machine-read and get no CSP. */
const NO_CSP_PREFIXES = ['/api/'];

/**
 * Headers to add to a response for `url`. The CSP (and its reporting
 * endpoint) only go on non-API responses; the others go everywhere.
 */
export function securityHeadersFor(
	url: URL,
	{ dev = false } = {},
): Record<string, string> {
	const headers: Record<string, string> = {
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'X-Frame-Options': 'DENY',
	};
	if (!NO_CSP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
		headers['Content-Security-Policy-Report-Only'] = contentSecurityPolicy({
			dev,
		});
		headers['Reporting-Endpoints'] =
			`${CSP_REPORT_GROUP}="${url.origin}${CSP_REPORT_PATH}"`;
	}
	return headers;
}

/**
 * Returns `response` with `headers` set (existing values are kept). Copies
 * the response first when its headers are immutable (e.g. a passed-through
 * fetch response).
 */
export function withHeaders(
	response: Response,
	headers: Record<string, string>,
): Response {
	const missing = Object.entries(headers).filter(
		([name]) => !response.headers.has(name),
	);
	if (missing.length === 0) return response;
	try {
		for (const [name, value] of missing) response.headers.set(name, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		for (const [name, value] of missing) copy.headers.set(name, value);
		return copy;
	}
}
