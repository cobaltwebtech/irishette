import { Icon } from '@iconify/react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useId, useState } from 'react';
import { toast } from 'sonner';
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
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';
import { invalidateSession, requireNoSession } from '@/lib/auth-check';
import { authClient } from '@/lib/auth-client';
import {
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
} from '@/lib/auth-constants';
import { authLinkErrorMessage } from '@/lib/auth-errors';
import { emailSchema, firstIssue } from '@/lib/auth-validation';
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

function LoginPage() {
	const search = Route.useSearch();
	const router = useRouter();
	const queryClient = useQueryClient();
	const turnstile = useTurnstile();
	const passwordId = useId();

	const [mode, setMode] = useState<'magic' | 'password'>('magic');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const { isLoading, error, setError, run } = useAuthRequest(turnstile);
	const magicLinkURLs = useMagicLinkURLs(search.redirect);
	const [needsVerification, setNeedsVerification] = useState(false);
	const [sentTo, setSentTo] = useState('');

	const redirectTo = search.redirect ?? DEFAULT_AUTH_REDIRECT;

	// Show an email-link error once, then drop it from the URL.
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

	const switchMode = () => {
		setMode(mode === 'magic' ? 'password' : 'magic');
		setError('');
		setNeedsVerification(false);
	};

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = emailSchema.safeParse({ email });
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		await run(
			() =>
				authClient.signIn.magicLink({
					email: parsed.data.email,
					...magicLinkURLs,
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setSentTo(parsed.data.email) },
		);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = emailSchema.safeParse({ email });
		if (!parsed.success || !password) {
			setError(
				parsed.success ? 'Password is required' : firstIssue(parsed.error),
			);
			return;
		}
		setNeedsVerification(false);
		await run(
			() =>
				authClient.signIn.email({
					email: parsed.data.email,
					password,
					callbackURL: redirectTo,
					fetchOptions: { headers: turnstile.headers },
				}),
			{
				onError: (signInError) =>
					setNeedsVerification(signInError.code === 'EMAIL_NOT_VERIFIED'),
				onSuccess: async () => {
					toast.success('Logged in');
					await invalidateSession(queryClient, router);
					// history.push keeps the full (already sanitized) path + search.
					router.history.push(redirectTo);
				},
			},
		);
	};

	if (sentTo) {
		return (
			<CheckEmailPanel
				email={sentTo}
				purpose="sign in to your Irishette account"
				lifetime={formatLinkLifetime(MAGIC_LINK_EXPIRES_IN)}
			>
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => setSentTo('')}
				>
					<Icon icon="tabler:mail-share" className="size-5" />
					Send another link
				</Button>
			</CheckEmailPanel>
		);
	}

	const isMagic = mode === 'magic';

	return (
		<AuthCard
			icon="tabler:user-circle"
			title="Login to Your Account"
			description={
				isMagic
					? 'Enter your email address and we will email you a link to log in. No password needed.'
					: 'Enter your email address and password.'
			}
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
			<form
				onSubmit={isMagic ? handleMagicLink : handlePassword}
				className="space-y-4"
				noValidate
			>
				<EmailField value={email} onChange={setEmail} disabled={isLoading} />

				{!isMagic && (
					<div className="flex flex-col gap-2">
						<div className="flex items-center">
							<Label htmlFor={passwordId}>Password</Label>
							<Link
								to="/auth/forgot-password"
								search={{ redirect: search.redirect }}
								className="ml-auto inline-block text-sm text-accent underline-offset-4 hover:underline"
							>
								Forgot your password?
							</Link>
						</div>
						<PasswordInput
							id={passwordId}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={isLoading}
							autoComplete="current-password"
						/>
					</div>
				)}

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
							{isMagic ? 'Sending link...' : 'Logging in...'}
						</>
					) : isMagic ? (
						<>
							<Icon icon="tabler:mail" className="size-5" />
							Email me a login link
						</>
					) : (
						'Login'
					)}
				</Button>
			</form>

			{needsVerification && (
				<ResendVerification email={email} callbackURL={redirectTo} />
			)}

			<AuthModeToggle
				mode={mode}
				onToggle={switchMode}
				magicLabel="Email me a login link instead"
			/>
		</AuthCard>
	);
}
