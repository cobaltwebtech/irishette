import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { CheckEmailPanel } from '@/components/auth/CheckEmailPanel';
import { EmailField } from '@/components/auth/EmailField';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import { requireNoSession } from '@/lib/auth/auth-check';
import { authClient } from '@/lib/auth/auth-client';
import {
	formatLinkLifetime,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth/auth-constants';
import { emailSchema } from '@/lib/auth/auth-validation';
import { redirectSearchParam } from '@/lib/auth/redirect';

export const Route = createFileRoute('/auth/forgot-password')({
	head: () => ({
		meta: [{ title: 'Forgot Password | Irishette.com' }],
	}),
	validateSearch: z.object({ redirect: redirectSearchParam }),
	// Signed-in users skip this page.
	beforeLoad: (ctx) => requireNoSession(ctx),
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const search = Route.useSearch();
	const turnstile = useTurnstile();
	const [email, setEmail] = useState('');
	const { isLoading, error, run, validate } = useAuthRequest(turnstile);
	const [sentTo, setSentTo] = useState('');

	const backToLogin = (
		<p>
			Remember your password?{' '}
			<Link
				to="/auth/login"
				className="text-accent underline-offset-4 hover:underline"
				search={{ redirect: search.redirect, error: undefined }}
			>
				Back to Login
			</Link>
		</p>
	);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = validate(emailSchema, { email });
		if (!data) return;
		await run(
			() =>
				authClient.requestPasswordReset({
					email: data.email,
					redirectTo: '/auth/reset-password',
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSentTo(data.email) },
		);
	};

	if (sentTo) {
		return (
			<CheckEmailPanel
				email={sentTo}
				purpose="choose a new password (we only send it if the address has an account with a password)"
				lifetime={formatLinkLifetime(PASSWORD_RESET_EXPIRES_IN)}
				footer={backToLogin}
			>
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => setSentTo('')}
				>
					← Try another email
				</Button>
			</CheckEmailPanel>
		);
	}

	return (
		<AuthCard
			icon="tabler:lock-cog"
			title="Forgot Your Password"
			description="Enter your email address and we'll send you a link to reset your password."
			footer={backToLogin}
		>
			<form onSubmit={handleSubmit} className="space-y-4" noValidate>
				<EmailField value={email} onChange={setEmail} disabled={isLoading} />

				<AuthError message={error} />

				<TurnstileField
					widgetRef={turnstile.ref}
					onToken={turnstile.setToken}
				/>

				<AuthSubmitButton
					isLoading={isLoading}
					disabled={!email || !turnstile.token}
					loadingLabel="Sending reset link..."
					icon="tabler:mail-share"
				>
					Send reset link
				</AuthSubmitButton>
			</form>
		</AuthCard>
	);
}
