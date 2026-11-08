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

export const emailSchema = z.object({ email: emailField });

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
