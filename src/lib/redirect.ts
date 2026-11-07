import { redirect } from '@tanstack/react-router';
import { z } from 'zod';
import type { AppSession } from '@/lib/session';

export const DEFAULT_AUTH_REDIRECT = '/account';

/**
 * True for same-origin relative paths only: must start with a single `/`,
 * no `//` or `/\` (protocol-relative), no backslashes or control characters.
 */
function isSafeRedirect(value: string): boolean {
	if (!value.startsWith('/') || value.startsWith('//')) return false;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return false;
	try {
		const base = 'http://localhost';
		return new URL(value, base).origin === base;
	} catch {
		return false;
	}
}

/**
 * `?redirect=` search param. Unsafe values are dropped (become undefined),
 * so consumers can use `search.redirect ?? DEFAULT_AUTH_REDIRECT`.
 */
export const redirectSearchParam = z
	.string()
	.refine(isSafeRedirect)
	.optional()
	.catch(undefined);

/**
 * beforeLoad guard for auth pages (login, signup, password reset): a signed-in
 * user is sent on to the (sanitized) redirect target instead.
 */
export function redirectIfSignedIn(
	session: AppSession,
	redirectTo: string | undefined,
) {
	if (session) {
		throw redirect({ href: redirectTo ?? DEFAULT_AUTH_REDIRECT });
	}
}
