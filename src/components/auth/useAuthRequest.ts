import { useState } from 'react';

import { type AuthClientError, authErrorMessage } from '@/lib/auth-errors';

/**
 * Submit state for an auth form. `run` sends one Better Auth client request:
 * it checks the returned `error` (Better Auth does not throw on API errors),
 * shows a mapped message, and always resets the Turnstile widget afterwards
 * (tokens are single-use), whether the request succeeded or not.
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

	return { isLoading, error, setError, run };
}
