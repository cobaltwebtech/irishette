import { describe, expect, it } from 'vite-plus/test';

import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-constants';
import {
	authErrorMessage,
	authLinkErrorMessage,
	isLinkError,
} from '@/lib/auth-errors';
import {
	magicLinkSignupSchema,
	passwordSchema,
	registerSchema,
} from '@/lib/auth-validation';
import { phoneNumberSchema } from '@/lib/user-validation';

describe('link lifetimes (plan 02, 2.3)', () => {
	it('magic link 15 minutes, reset and verification 1 hour', () => {
		expect(formatLinkLifetime(MAGIC_LINK_EXPIRES_IN)).toBe('15 minutes');
		expect(formatLinkLifetime(PASSWORD_RESET_EXPIRES_IN)).toBe('1 hour');
		expect(formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)).toBe('1 hour');
	});

	it('formats singular and plural units', () => {
		expect(formatLinkLifetime(60)).toBe('1 minute');
		expect(formatLinkLifetime(2 * 60 * 60)).toBe('2 hours');
		expect(formatLinkLifetime(90 * 60)).toBe('90 minutes');
	});
});

describe('authErrorMessage', () => {
	it('maps Better Auth codes and 429', () => {
		expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
			'Incorrect email or password.',
		);
		expect(authErrorMessage({ code: 'MISSING_RESPONSE' })).toMatch(
			/security check/,
		);
		expect(authErrorMessage({ status: 429, message: 'x' })).toMatch(
			/Too many attempts/,
		);
	});

	it('never shows raw server messages for unknown codes', () => {
		expect(
			authErrorMessage({ code: 'SOMETHING_NEW', message: 'stack trace' }),
		).toBe('Something went wrong. Please try again.');
		expect(authErrorMessage(null, 'Fallback')).toBe('Fallback');
	});

	it('maps email link codes', () => {
		expect(isLinkError('INVALID_TOKEN')).toBe(true);
		expect(isLinkError('INVALID_EMAIL_OR_PASSWORD')).toBe(false);
		expect(authLinkErrorMessage('TOKEN_EXPIRED')).toBe(
			'This link has expired.',
		);
		expect(authLinkErrorMessage('<script>')).toMatch(/Something went wrong/);
	});
});

describe('auth form schemas', () => {
	it('registerSchema uses the password rules', () => {
		const base = { name: 'Guest', email: 'g@example.test' };
		expect(
			registerSchema.safeParse({
				...base,
				password: 'alllowercase1',
				confirmPassword: 'alllowercase1',
			}).success,
		).toBe(false);
		expect(
			registerSchema.safeParse({
				...base,
				password: 'Valid1Password',
				confirmPassword: 'Valid1Password',
			}).success,
		).toBe(true);
		expect(
			registerSchema.safeParse({
				...base,
				password: 'Valid1Password',
				confirmPassword: 'Different1',
			}).success,
		).toBe(false);
		expect(passwordSchema.safeParse({ password: 'Short1' }).success).toBe(
			false,
		);
	});

	it('magic-link sign-up needs a name', () => {
		expect(
			magicLinkSignupSchema.safeParse({ name: ' ', email: 'g@example.test' })
				.success,
		).toBe(false);
	});

	it('phoneNumberSchema trims and needs 10 digits, max 20 characters', () => {
		expect(phoneNumberSchema.parse(' (555) 555-0142 ')).toBe('(555) 555-0142');
		expect(phoneNumberSchema.safeParse('555-0142').success).toBe(false);
		expect(phoneNumberSchema.safeParse('1'.repeat(21)).success).toBe(false);
	});
});
