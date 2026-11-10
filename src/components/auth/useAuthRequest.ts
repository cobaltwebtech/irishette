import { useState } from 'react';
import type { z } from 'zod';

import { type AuthClientError, authErrorMessage } from '@/lib/auth/auth-errors';
import { firstIssue } from '@/lib/auth/auth-validation';

/**
 * Submit state for an auth form. `run` sends one Better Auth client request:
 * it checks the returned `error` (Better Auth does not throw on API errors),
 * shows a mapped message, and always resets the Turnstile widget afterwards
 * (tokens are single-use), whether the request succeeded or not.
 * `validate` parses the form input first and shows its first issue.
 */
export function useAuthRequest(turnstile?: { reset: () => void }) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');

	async function run(
		request: () => Promise<{ error: AuthClientError | null }>,
		{
			onSuccess,
			onError,
		}: {
			onSuccess: () => void | Promise<void>;
			onError?: (error: AuthClientError) => void;
		},
	) {
		setIsLoading(true);
		setError('');
		try {
			const { error: requestError } = await request();
			if (requestError) {
				setError(authErrorMessage(requestError));
				onError?.(requestError);
				return;
			}
			await onSuccess();
		} catch {
			setError(authErrorMessage(null));
		} finally {
			setIsLoading(false);
			turnstile?.reset();
		}
	}

	/** Parsed input, or null after showing the first issue as the error. */
	function validate<T>(schema: z.ZodType<T>, input: unknown): T | null {
		const parsed = schema.safeParse(input);
		if (parsed.success) return parsed.data;
		setError(firstIssue(parsed.error));
		return null;
	}

	return { isLoading, error, setError, run, validate };
}
