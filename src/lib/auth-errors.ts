// User-facing messages for Better Auth errors: the `{ error }` that every
// authClient call returns, and the `?error=CODE` that its email links add to
// the redirect when a link is invalid or expired. Shared by the auth pages.

/** The `error` of a Better Auth client result (only the fields read here). */
export interface AuthClientError {
	code?: string;
	message?: string;
	status?: number;
}

const TOO_MANY_REQUESTS =
	'Too many attempts. Please wait a minute and try again.';

const MESSAGES: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
	EMAIL_NOT_VERIFIED:
		'Please verify your email address first. We can send you a new verification link.',
	USER_ALREADY_EXISTS:
		'An account with this email already exists. Log in instead, or use a magic link.',
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		'An account with this email already exists. Log in instead, or use a magic link.',
	PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
	PASSWORD_TOO_LONG: 'Password is too long.',
	INVALID_EMAIL: 'Please enter a valid email address.',
	// Links from emails (magic link, verification, password reset).
	INVALID_TOKEN: 'This link is invalid or has already been used.',
	TOKEN_EXPIRED: 'This link has expired.',
	EXPIRED_TOKEN: 'This link has expired.',
	USER_NOT_FOUND: 'This link is no longer valid.',
	// Turnstile (Better Auth captcha plugin).
	MISSING_RESPONSE: 'Please complete the security check, then try again.',
	VERIFICATION_FAILED: 'The security check failed. Please try again.',
};

/** True for the codes that mean "this email link no longer works". */
export function isLinkError(code: string): boolean {
	return [
		'INVALID_TOKEN',
		'TOKEN_EXPIRED',
		'EXPIRED_TOKEN',
		'USER_NOT_FOUND',
	].includes(code);
}

/** Message for a Better Auth client error (or an unexpected thrown value). */
export function authErrorMessage(
	error: AuthClientError | null | undefined,
	fallback = 'Something went wrong. Please try again.',
): string {
	if (!error) return fallback;
	if (error.status === 429) return TOO_MANY_REQUESTS;
	if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
	return fallback;
}

/** Message for an `?error=CODE` added to a redirect by an email link. */
export function authLinkErrorMessage(code: string): string {
	return (
		MESSAGES[code] ?? 'Something went wrong with that link. Please try again.'
	);
}
