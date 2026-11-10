// Lifetimes of the links Better Auth emails (seconds). src/lib/auth/auth.ts passes
// them to Better Auth, and the auth pages and emails show the same values
// through formatLinkLifetime, so the text always matches the real expiry.

/** Magic sign-in / sign-up link. */
export const MAGIC_LINK_EXPIRES_IN = 15 * 60;
/** Password reset link. */
export const PASSWORD_RESET_EXPIRES_IN = 60 * 60;
/** Email verification link (also used for email change confirmations). */
export const EMAIL_VERIFICATION_EXPIRES_IN = 60 * 60;

/** "15 minutes", "1 hour", "2 hours" (whole minutes or hours). */
export function formatLinkLifetime(seconds: number): string {
	const minutes = Math.round(seconds / 60);
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	}
	return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
