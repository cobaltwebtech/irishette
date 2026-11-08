import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { CheckEmailPanel } from '@/components/auth/CheckEmailPanel';
import { EmailField } from '@/components/auth/EmailField';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import { requireNoSession } from '@/lib/auth-check';
import { authClient } from '@/lib/auth-client';
import {
	formatLinkLifetime,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-constants';
import { emailSchema, firstIssue } from '@/lib/auth-validation';
import { redirectSearchParam } from '@/lib/redirect';

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
	const { isLoading, error, setError, run } = useAuthRequest(turnstile);
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
		const parsed = emailSchema.safeParse({ email });
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		await run(
			() =>
				authClient.requestPasswordReset({
					email: parsed.data.email,
					redirectTo: '/auth/reset-password',
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSentTo(parsed.data.email) },
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

				<Button
					type="submit"
					className="w-full"
					disabled={isLoading || !email || !turnstile.token}
				>
					{isLoading ? (
						<>
							<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
							Sending reset link...
						</>
					) : (
						<>
							<Icon icon="tabler:mail-share" className="size-5" />
							Send reset link
						</>
					)}
				</Button>
			</form>
		</AuthCard>
	);
}
