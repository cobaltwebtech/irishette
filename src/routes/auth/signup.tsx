import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { AuthModeToggle } from '@/components/auth/AuthModeToggle';
import { CheckEmailPanel } from '@/components/auth/CheckEmailPanel';
import { EmailField } from '@/components/auth/EmailField';
import { useMagicLinkURLs } from '@/components/auth/magic-link';
import { ResendVerification } from '@/components/auth/ResendVerification';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';
import { requireNoSession } from '@/lib/auth-check';
import { authClient } from '@/lib/auth-client';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
} from '@/lib/auth-constants';
import {
	firstIssue,
	magicLinkSignupSchema,
	registerSchema,
} from '@/lib/auth-validation';
import { DEFAULT_AUTH_REDIRECT, redirectSearchParam } from '@/lib/redirect';

export const Route = createFileRoute('/auth/signup')({
	head: () => ({
		meta: [{ title: 'Sign Up for New Account | Irishette.com' }],
	}),
	validateSearch: z.object({ redirect: redirectSearchParam }),
	// Signed-in users skip the signup page.
	beforeLoad: (ctx) => requireNoSession(ctx),
	component: SignupPage,
});

function SignupPage() {
	const search = Route.useSearch();
	const turnstile = useTurnstile();
	const nameId = useId();
	const passwordId = useId();
	const confirmPasswordId = useId();

	const [mode, setMode] = useState<'magic' | 'password'>('magic');
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { isLoading, error, setError, run } = useAuthRequest(turnstile);
	const magicLinkURLs = useMagicLinkURLs(search.redirect);
	const [sent, setSent] = useState<{
		email: string;
		mode: 'magic' | 'password';
	} | null>(null);

	const redirectTo = search.redirect ?? DEFAULT_AUTH_REDIRECT;

	const switchMode = () => {
		setMode(mode === 'magic' ? 'password' : 'magic');
		setError('');
	};

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = magicLinkSignupSchema.safeParse({ name, email });
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		// `name` is used when the link creates the account (an existing account
		// is simply signed in).
		await run(
			() =>
				authClient.signIn.magicLink({
					email: parsed.data.email,
					name: parsed.data.name,
					...magicLinkURLs,
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSent({ email: parsed.data.email, mode: 'magic' }) },
		);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = registerSchema.safeParse({
			name,
			email,
			password,
			confirmPassword,
		});
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		await run(
			() =>
				authClient.signUp.email({
					name: parsed.data.name,
					email: parsed.data.email,
					password: parsed.data.password,
					callbackURL: redirectTo,
					fetchOptions: { headers: turnstile.headers },
				}),
			{
				onSuccess: () =>
					setSent({ email: parsed.data.email, mode: 'password' }),
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

	const isMagic = mode === 'magic';

	return (
		<AuthCard
			icon="tabler:user-plus"
			title="Create an Account"
			description={
				isMagic
					? 'Enter your name and email address and we will email you a link to create your account. No password needed.'
					: 'Enter your details and choose a password. We will email you a link to verify your address.'
			}
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
						<div className="flex flex-col gap-2">
							<Label htmlFor={passwordId}>Password</Label>
							<PasswordInput
								id={passwordId}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="At least 8 characters"
								required
								disabled={isLoading}
								autoComplete="new-password"
							/>
							<p className="text-xs text-muted-foreground">
								Use upper and lower case letters and at least one number.
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor={confirmPasswordId}>Confirm Password</Label>
							<PasswordInput
								id={confirmPasswordId}
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								placeholder="Re-enter your password"
								required
								disabled={isLoading}
								autoComplete="new-password"
							/>
						</div>
					</>
				)}

				<AuthError message={error} />

				<TurnstileField
					widgetRef={turnstile.ref}
					onToken={turnstile.setToken}
				/>

				<Button
					type="submit"
					className="w-full"
					disabled={isLoading || !name || !email || !turnstile.token}
				>
					{isLoading ? (
						<>
							<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
							{isMagic ? 'Sending link...' : 'Creating account...'}
						</>
					) : isMagic ? (
						<>
							<Icon icon="tabler:mail" className="size-5" />
							Email me a sign-up link
						</>
					) : (
						'Create account'
					)}
				</Button>
			</form>

			<AuthModeToggle
				mode={mode}
				onToggle={switchMode}
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
	sent: { email: string; mode: 'magic' | 'password' };
	callbackURL: string;
	onSendAgain: () => void;
}) {
	if (sent.mode === 'magic') {
		return (
			<CheckEmailPanel
				email={sent.email}
				purpose="finish creating your account and sign in"
				lifetime={formatLinkLifetime(MAGIC_LINK_EXPIRES_IN)}
			>
				<Button variant="secondary" className="w-full" onClick={onSendAgain}>
					<Icon icon="tabler:mail-share" className="size-5" />
					Send another link
				</Button>
			</CheckEmailPanel>
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
