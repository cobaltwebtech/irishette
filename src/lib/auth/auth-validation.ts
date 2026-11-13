import { z } from 'zod';

// Client-side checks for the auth forms (Better Auth validates again on the
// server).

const emailField = z.email('Please enter a valid email address');

const nameField = z
	.string()
	.trim()
	.min(2, 'Name must be at least 2 characters')
	.max(100, 'Name must be at most 100 characters');

/** Password rules: 8-100 characters with upper case, lower case and a digit. */
const passwordField = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(100, 'Password must be less than 100 characters')
	.regex(
		/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
		'Password must contain at least one uppercase letter, one lowercase letter, and one number',
	);

export const passwordSchema = z.object({ password: passwordField });

/**
 * Signed-in password change (/admin/settings): the current password, a new
 * one that follows the rules, typed twice. Better Auth's changePassword
 * checks the current password.
 */
export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Enter your current password'),
		newPassword: passwordField,
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	})
	.refine((data) => data.newPassword !== data.currentPassword, {
		message: 'The new password must differ from the current one',
		path: ['newPassword'],
	});

/**
 * tRPC `users.adminSetPassword`: a first password for an account that signs
 * in by magic link only (Better Auth's server-only setPassword).
 */
export const setPasswordSchema = z.object({ newPassword: passwordField });

export const emailSchema = z.object({ email: emailField });

/** Email + password sign-in: any non-empty password (rules apply at sign-up). */
export const loginSchema = z.object({
	email: emailField,
	password: z.string().min(1, 'Password is required'),
});

/** Magic-link sign-up: the name is used when the link creates the account. */
export const magicLinkSignupSchema = z.object({
	name: nameField,
	email: emailField,
});

/** Email + password sign-up (same password rules as reset). */
export const registerSchema = z
	.object({
		name: nameField,
		email: emailField,
		password: passwordField,
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	});

/** First issue's message, for the inline form error. */
export function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? 'Please check the form.';
}
