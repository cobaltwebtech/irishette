import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { AuthModeToggle } from '@/components/auth/AuthModeToggle';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import {
	CheckEmailPanel,
	MagicLinkSentPanel,
} from '@/components/auth/CheckEmailPanel';
import { EmailField } from '@/components/auth/EmailField';
import { useMagicLinkURLs } from '@/components/auth/magic-link';
import { PasswordField } from '@/components/auth/PasswordField';
import { ResendVerification } from '@/components/auth/ResendVerification';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { type AuthMode, useAuthMode } from '@/components/auth/useAuthMode';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireNoSession } from '@/lib/auth/auth-check';
import { authClient } from '@/lib/auth/auth-client';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
} from '@/lib/auth/auth-constants';
import {
	magicLinkSignupSchema,
	registerSchema,
} from '@/lib/auth/auth-validation';
import {
	DEFAULT_AUTH_REDIRECT,
	redirectSearchParam,
} from '@/lib/auth/redirect';

export const Route = createFileRoute('/auth/signup')({
	head: () => ({
		meta: [{ title: 'Sign Up for New Account | Irishette.com' }],
	}),
	validateSearch: z.object({ redirect: redirectSearchParam }),
	// Signed-in users skip the signup page.
	beforeLoad: (ctx) => requireNoSession(ctx),
	component: SignupPage,
});

const COPY = {
	magic: {
		description:
			'Enter your name and email address and we will email you a link to create your account. No password needed.',
		loadingLabel: 'Sending link...',
		submitIcon: 'tabler:mail',
		submitLabel: 'Email me a sign-up link',
	},
	password: {
		description:
			'Enter your details and choose a password. We will email you a link to verify your address.',
		loadingLabel: 'Creating account...',
		submitIcon: undefined,
		submitLabel: 'Create account',
	},
};

function SignupPage() {
	const search = Route.useSearch();
	const turnstile = useTurnstile();
	const nameId = useId();

	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { isLoading, error, setError, run, validate } =
		useAuthRequest(turnstile);
	const magicLinkURLs = useMagicLinkURLs(search.redirect);
	const [sent, setSent] = useState<{ email: string; mode: AuthMode } | null>(
		null,
	);
	const { mode, isMagic, toggleMode } = useAuthMode(() => setError(''));

	const redirectTo = search.redirect ?? DEFAULT_AUTH_REDIRECT;
	const copy = COPY[mode];

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = validate(magicLinkSignupSchema, { name, email });
		if (!data) return;
		// `name` is used when the link creates the account (an existing account
		// is simply signed in).
		await run(
			() =>
				authClient.signIn.magicLink({
					email: data.email,
					name: data.name,
					...magicLinkURLs,
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSent({ email: data.email, mode: 'magic' }) },
		);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = validate(registerSchema, {
			name,
			email,
			password,
			confirmPassword,
		});
		if (!data) return;
		await run(
			() =>
				authClient.signUp.email({
					name: data.name,
					email: data.email,
					password: data.password,
					callbackURL: redirectTo,
					fetchOptions: { headers: turnstile.headers },
				}),
			{
				onSuccess: () => setSent({ email: data.email, mode: 'password' }),
			},
		);
	};

	if (sent) {
		return (
			<SignupSent
				sent={sent}
				callbackURL={redirectTo}
				onSendAgain={() => setSent(null)}
			/>
		);
	}

	return (
		<AuthCard
			icon="tabler:user-plus"
			title="Create an Account"
			description={copy.description}
			footer={
				<p>
					Already have an account?{' '}
					<Link
						to="/auth/login"
						search={{ redirect: search.redirect, error: undefined }}
						className="text-accent underline-offset-4 hover:underline"
					>
						Log In
					</Link>
				</p>
			}
		>
			<form
				onSubmit={isMagic ? handleMagicLink : handlePassword}
				className="space-y-4"
				noValidate
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor={nameId}>Name</Label>
					<Input
						id={nameId}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Enter your full name"
						required
						disabled={isLoading}
						autoComplete="name"
					/>
				</div>
				<EmailField value={email} onChange={setEmail} disabled={isLoading} />

				{!isMagic && (
					<>
						<PasswordField
							label="Password"
							hint="Use upper and lower case letters and at least one number."
							value={password}
							onChange={setPassword}
							placeholder="At least 8 characters"
							required
							disabled={isLoading}
							autoComplete="new-password"
						/>
						<PasswordField
							label="Confirm Password"
							value={confirmPassword}
							onChange={setConfirmPassword}
							placeholder="Re-enter your password"
							required
							disabled={isLoading}
							autoComplete="new-password"
						/>
					</>
				)}

				<AuthError message={error} />

				<TurnstileField
					widgetRef={turnstile.ref}
					onToken={turnstile.setToken}
				/>

				<AuthSubmitButton
					isLoading={isLoading}
					disabled={!name || !email || !turnstile.token}
					loadingLabel={copy.loadingLabel}
					icon={copy.submitIcon}
				>
					{copy.submitLabel}
				</AuthSubmitButton>
			</form>

			<AuthModeToggle
				mode={mode}
				onToggle={toggleMode}
				magicLabel="Email me a sign-up link instead"
			/>
		</AuthCard>
	);
}

/** "Check your email" after a sign-up request (magic link or verification). */
function SignupSent({
	sent,
	callbackURL,
	onSendAgain,
}: {
	sent: { email: string; mode: AuthMode };
	callbackURL: string;
	onSendAgain: () => void;
}) {
	if (sent.mode === 'magic') {
		return (
			<MagicLinkSentPanel
				email={sent.email}
				purpose="finish creating your account and sign in"
				onSendAgain={onSendAgain}
			/>
		);
	}
	return (
		<CheckEmailPanel
			email={sent.email}
			purpose="verify your email address"
			lifetime={formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)}
		>
			<ResendVerification email={sent.email} callbackURL={callbackURL} />
		</CheckEmailPanel>
	);
}
