// Cloudflare Turnstile Siteverify for forms outside Better Auth (Better Auth's
// captcha plugin verifies its own endpoints). Server-only.
//
// Fails closed: a network error, a timeout, a non-2xx answer or an unreadable
// body all count as "not verified". Tokens are single-use, so the client must
// reset its widget after every request.

const SITEVERIFY_URL =
	'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 10_000;

export type TurnstileResult =
	| { success: true }
	| { success: false; reason: 'invalid' | 'unavailable' };

export async function verifyTurnstile(
	secret: string,
	token: string,
	remoteIp: string | null,
	{ timeoutMs = SITEVERIFY_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<TurnstileResult> {
	if (!secret) {
		console.error('Turnstile: TURNSTILE_SECRET_KEY is not set');
		return { success: false, reason: 'unavailable' };
	}
	if (!token || token.length > 2048)
		return { success: false, reason: 'invalid' };
	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);
	let result: { success?: unknown; 'error-codes'?: unknown };
	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) throw new Error(`Siteverify ${response.status}`);
		result = await response.json();
	} catch (error) {
		console.error(
			'Turnstile: Siteverify failed:',
			error instanceof Error ? error.message : 'Unknown error',
		);
		return { success: false, reason: 'unavailable' };
	}
	if (result.success === true) return { success: true };
	console.warn(
		JSON.stringify({
			message: 'turnstile-rejected',
			errorCodes: Array.isArray(result['error-codes'])
				? result['error-codes']
				: [],
		}),
	);
	return { success: false, reason: 'invalid' };
}
