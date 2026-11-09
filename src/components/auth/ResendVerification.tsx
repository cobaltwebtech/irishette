import { Icon } from '@iconify/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
} from '@/lib/auth-constants';

import { AuthError } from './AuthCard';
import { TurnstileField, useTurnstile } from './TurnstileField';
import { useAuthRequest } from './useAuthRequest';

/**
 * "Resend verification email" for an unverified email + password account
 * (Turnstile-protected; Better Auth answers the same way for unknown or
 * already verified addresses, so nothing about the account is revealed).
 */
export function ResendVerification({
	email,
	callbackURL,
}: {
	email: string;
	callbackURL: string;
}) {
	const turnstile = useTurnstile();
	const { isLoading, error, run } = useAuthRequest(turnstile);
	const [sent, setSent] = useState(false);

	const resend = () =>
		run(
			() =>
				authClient.sendVerificationEmail({
					email,
					callbackURL,
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSent(true) },
		);

	return (
		<div className="space-y-3">
			{sent ? (
				<p
					className="text-center text-sm text-muted-foreground"
					aria-live="polite"
				>
					If this address has an unverified account, a new verification link is
					on its way. It expires in{' '}
					{formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)}.
				</p>
			) : (
				<>
					<TurnstileField
						widgetRef={turnstile.ref}
						onToken={turnstile.setToken}
					/>
					<Button
						type="button"
						variant="secondary"
						className="w-full"
						onClick={() => void resend()}
						disabled={isLoading || !turnstile.token}
					>
						<Icon icon="tabler:mail-forward" className="size-5" />
						{isLoading ? 'Sending...' : 'Resend verification email'}
					</Button>
				</>
			)}
			<AuthError message={error} />
		</div>
	);
}
