import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { AuthModeToggle } from '@/components/auth/AuthModeToggle';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { MagicLinkSentPanel } from '@/components/auth/CheckEmailPanel';
import { EmailField } from '@/components/auth/EmailField';
import { useMagicLinkURLs } from '@/components/auth/magic-link';
import { PasswordField } from '@/components/auth/PasswordField';
import { ResendVerification } from '@/components/auth/ResendVerification';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { useAuthMode } from '@/components/auth/useAuthMode';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { toast } from '@/components/ui/toast';
import { invalidateSession, requireNoSession } from '@/lib/auth-check';
import { authClient } from '@/lib/auth-client';
import { authLinkErrorMessage } from '@/lib/auth-errors';
import { emailSchema, loginSchema } from '@/lib/auth-validation';
import { DEFAULT_AUTH_REDIRECT, redirectSearchParam } from '@/lib/redirect';

export const Route = createFileRoute('/auth/login')({
	head: () => ({
		meta: [{ title: 'Login to Account | Irishette.com' }],
	}),
	validateSearch: z.object({
		redirect: redirectSearchParam,
		error: z.string().max(100).optional().catch(undefined),
	}),
	// Signed-in users skip the login page.
	beforeLoad: (ctx) => requireNoSession(ctx),
	component: LoginPage,
});

/**
 * `?error=CODE` from an email link: on this page (magic link errorCallbackURL)
 * or inside the redirect target (verification links add it to their
 * callbackURL, which then bounces here through the signed-in guard).
 * Returns the code and the redirect without it.
 */
function linkError(search: { redirect?: string; error?: string }) {
	if (search.error) return { code: search.error, redirect: search.redirect };
	if (!search.redirect?.includes('error=')) return null;
	const url = new URL(search.redirect, 'http://localhost');
	const code = url.searchParams.get('error');
	if (!code) return null;
	url.searchParams.delete('error');
	return { code, redirect: url.pathname + url.search };
}

/** Show an email-link error once, then drop it from the URL. */
function useLinkError(
	search: { redirect?: string; error?: string },
	setError: (message: string) => void,
) {
	const router = useRouter();
	const showLinkError = useEffectEvent(
		(found: { code: string; redirect?: string }) => {
			setError(`${authLinkErrorMessage(found.code)} Request a new link below.`);
			void router.navigate({
				to: '/auth/login',
				search: { redirect: found.redirect, error: undefined },
				replace: true,
			});
		},
	);
	useEffect(() => {
		const found = linkError(search);
		if (found) showLinkError(found);
	}, [search]);
}

const COPY = {
	magic: {
		description:
			'Enter your email address and we will email you a link to log in. No password needed.',
		loadingLabel: 'Sending link...',
		submitIcon: 'tabler:mail',
		submitLabel: 'Email me a login link',
	},
	password: {
		description: 'Enter your email address and password.',
		loadingLabel: 'Logging in...',
		submitIcon: undefined,
		submitLabel: 'Login',
	},
};

/** State and submit handlers of the login form (magic link or password). */
function useLoginForm(search: { redirect?: string; error?: string }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const turnstile = useTurnstile();

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const { isLoading, error, setError, run, validate } =
		useAuthRequest(turnstile);
	const magicLinkURLs = useMagicLinkURLs(search.redirect);
	const [needsVerification, setNeedsVerification] = useState(false);
	const [sentTo, setSentTo] = useState('');
	const { mode, isMagic, toggleMode } = useAuthMode(() => {
		setError('');
		setNeedsVerification(false);
	});
	useLinkError(search, setError);

	const redirectTo = search.redirect ?? DEFAULT_AUTH_REDIRECT;

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = validate(emailSchema, { email });
		if (!data) return;
		await run(
			() =>
				authClient.signIn.magicLink({
					email: data.email,
					...magicLinkURLs,
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSentTo(data.email) },
		);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = validate(loginSchema, { email, password });
		if (!data) return;
		setNeedsVerification(false);
		await run(
			() =>
				authClient.signIn.email({
					email: data.email,
					password: data.password,
					callbackURL: redirectTo,
					fetchOptions: { headers: turnstile.headers },
				}),
			{
				onError: (signInError) =>
					setNeedsVerification(signInError.code === 'EMAIL_NOT_VERIFIED'),
				onSuccess: async () => {
					toast.add({ type: 'success', title: 'Logged in' });
					await invalidateSession(queryClient, router);
					// history.push keeps the full (already sanitized) path + search.
					router.history.push(redirectTo);
				},
			},
		);
	};

	return {
		turnstile,
		email,
		setEmail,
		password,
		setPassword,
		isLoading,
		error,
		needsVerification,
		sentTo,
		setSentTo,
		mode,
		isMagic,
		toggleMode,
		redirectTo,
		handleSubmit: isMagic ? handleMagicLink : handlePassword,
	};
}

function LoginPage() {
	const search = Route.useSearch();
	const {
		turnstile,
		email,
		setEmail,
		password,
		setPassword,
		isLoading,
		error,
		needsVerification,
		sentTo,
		setSentTo,
		mode,
		isMagic,
		toggleMode,
		redirectTo,
		handleSubmit,
	} = useLoginForm(search);
	const copy = COPY[mode];

	if (sentTo) {
		return (
			<MagicLinkSentPanel
				email={sentTo}
				purpose="sign in to your Irishette account"
				onSendAgain={() => setSentTo('')}
			/>
		);
	}

	return (
		<AuthCard
			icon="tabler:user-circle"
			title="Login to Your Account"
			description={copy.description}
			footer={
				<p>
					Don&apos;t have an account?{' '}
					<Link
						to="/auth/signup"
						search={{ redirect: search.redirect }}
						className="text-accent underline-offset-4 hover:underline"
					>
						Sign Up
					</Link>
				</p>
			}
		>
			<form onSubmit={handleSubmit} className="space-y-4" noValidate>
				<EmailField value={email} onChange={setEmail} disabled={isLoading} />

				{!isMagic && (
					<PasswordField
						label="Password"
						labelAction={
							<Link
								to="/auth/forgot-password"
								search={{ redirect: search.redirect }}
								className="ml-auto inline-block text-sm text-accent underline-offset-4 hover:underline"
							>
								Forgot your password?
							</Link>
						}
						value={password}
						onChange={setPassword}
						required
						disabled={isLoading}
						autoComplete="current-password"
					/>
				)}

				<AuthError message={error} />

				<TurnstileField
					widgetRef={turnstile.ref}
					onToken={turnstile.setToken}
				/>

				<AuthSubmitButton
					isLoading={isLoading}
					disabled={!email || !turnstile.token}
					loadingLabel={copy.loadingLabel}
					icon={copy.submitIcon}
				>
					{copy.submitLabel}
				</AuthSubmitButton>
			</form>

			{needsVerification && (
				<ResendVerification email={email} callbackURL={redirectTo} />
			)}

			<AuthModeToggle
				mode={mode}
				onToggle={toggleMode}
				magicLabel="Email me a login link instead"
			/>
		</AuthCard>
	);
}
