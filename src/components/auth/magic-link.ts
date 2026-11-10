import { useRouter } from '@tanstack/react-router';

import { DEFAULT_AUTH_REDIRECT } from '@/lib/auth/redirect';

/**
 * Where a magic link from the login or signup page lands: the (sanitized)
 * redirect target, or the login page (same redirect) with `?error=CODE` when
 * the link is invalid or expired. Both are relative, so Better Auth's origin
 * check accepts them.
 */
export function useMagicLinkURLs(redirect: string | undefined) {
	const router = useRouter();
	return {
		callbackURL: redirect ?? DEFAULT_AUTH_REDIRECT,
		errorCallbackURL: router.buildLocation({
			to: '/auth/login',
			search: { redirect },
		}).href,
	};
}
