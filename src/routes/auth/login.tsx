import { Icon } from '@iconify/react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';
import { authClient, signIn } from '@/lib/auth-client';
import { requireNoSession } from '@/utils/auth-check';

export const Route = createFileRoute('/auth/login')({
	head: () => ({
		meta: [
			{
				title: 'Login to Account | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ search }) => {
		// Prevent logged-in users from accessing this route
		await requireNoSession(search.redirect);
	},
	validateSearch: (search: Record<string, unknown>) => {
		return {
			redirect: (search.redirect as string) || '/account',
		};
	},
	component: LoginPage,
});

function LoginPage() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [error, setError] = useState('');
	const [showPasswordLogin, setShowPasswordLogin] = useState(false);
	const emailInputId = useId();
	const passwordInputId = useId();

	const router = useRouter();
	const search = Route.useSearch();

	// Check for error query parameter on load
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const errorParam = urlParams.get('error');
		if (errorParam) {
			const decodedError = decodeURIComponent(errorParam);
			setError(decodedError);
			toast.error(decodedError);

			// Clean up the URL
			const newUrl = window.location.pathname;
			window.history.replaceState({}, document.title, newUrl);
		}
	}, []);

	const handleMagicLinkSignIn = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!email) {
			setError('Email is required');
			toast.error('Email is required');
			return;
		}

		setIsLoading(true);
		setError('');

		try {
			await authClient.signIn.magicLink({
				email,
				callbackURL: search.redirect,
			});
			setEmailSent(true);
			toast.success('Magic link sent! Check your email.');
		} catch (err: unknown) {
			console.error('Magic link sign-in error:', err);
			const message =
				err instanceof Error
					? err.message
					: 'Failed to send magic link. Please try again.';
			setError(message);
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	};

	const handlePasswordLogin = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!email || !password) {
			setError('Email and password are required');
			toast.error('Email and password are required');
			return;
		}

		setIsLoading(true);
		setError('');

		try {
			const response = await signIn.email({
				email,
				password,
				callbackURL: search.redirect,
				rememberMe: true,
			});

			if (response && !response.error) {
				toast.success('Login successful!');
				// Use router.history.push to preserve the full URL
				router.history.push(search.redirect);
				return;
			}

			if (response.error) {
				const errorMsg =
					response.error.message || 'Login failed. Please try again.';
				setError(errorMsg);
				toast.error(errorMsg);
				return;
			}
		} catch (error) {
			console.error('Login failed', error);
			const errorMsg =
				error instanceof Error
					? error.message
					: 'Login failed. Please check your credentials and try again.';
			setError(errorMsg);
			toast.error(errorMsg);
		} finally {
			setIsLoading(false);
		}
	};

	if (emailSent) {
		return (
			<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="flex items-center justify-center mb-4 mx-auto size-16 bg-primary rounded-full">
							<Icon
								icon="tabler:mail-fast"
								className="size-10 text-primary-foreground"
							/>
						</div>
						<CardTitle className="text-2xl font-bold">
							Check Your Email
						</CardTitle>
						<CardDescription>
							<p>We have emailed a magic link to:</p>
							<p className="font-semibold">{email}</p>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-center">
							Click the link in your email to sign in to your Irishette account.
							The link will expire in 15 minutes.
						</p>
						<div className="flex flex-auto flex-wrap items-center justify-center gap-4">
							<Button
								variant="secondary"
								onClick={() => {
									setEmailSent(false);
									setEmail('');
									setError('');
								}}
								className="flex-1"
							>
								<Icon icon="tabler:mail-share" className="size-5" />
								Send Another Link
							</Button>
							<Button
								className="flex-1"
								variant="outline"
								onClick={() => {
									setEmailSent(false);
									setEmail('');
									setPassword('');
									setError('');
									setShowPasswordLogin(false);
								}}
							>
								← Go Back to Login
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="flex items-center justify-center mx-auto mb-4 size-16 bg-primary rounded-full">
						<Icon
							icon="tabler:user-circle"
							className="size-10 text-primary-foreground"
						/>
					</div>
					<CardTitle className="text-2xl font-bold">
						Login to Your Account
					</CardTitle>
					<CardDescription>
						{showPasswordLogin
							? 'Enter your account email address and password to login. If you would like to login without a password, click the Login with Magic Link button below.'
							: 'Enter your account email address to receive a Magic Link and login without a password.'}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={
							showPasswordLogin ? handlePasswordLogin : handleMagicLinkSignIn
						}
						className="space-y-4"
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor={emailInputId}>Email</Label>
							<Input
								id={emailInputId}
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Enter your email address"
								required
								disabled={isLoading}
								autoComplete="email"
							/>
						</div>

						{showPasswordLogin && (
							<div className="flex flex-col gap-2">
								<div className="flex items-center">
									<Label htmlFor={passwordInputId}>Password</Label>
									<Link
										to="/auth/forgot-password"
										search={{ redirect: search.redirect }}
										className="ml-auto inline-block text-sm text-accent underline-offset-4 hover:underline"
									>
										Forgot your password?
									</Link>
								</div>
								<PasswordInput
									id={passwordInputId}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									disabled={isLoading}
									autoComplete="current-password"
								/>
							</div>
						)}

						{error && (
							<div className="inline-flex gap-1 text-sm font-bold text-destructive">
								<Icon icon="tabler:circle-x" className="size-5" />
								{error}
							</div>
						)}

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading || !email}
						>
							{isLoading ? (
								<>
									<Icon
										icon="tabler:loader-2"
										className="size-5 animate-spin"
									/>
									{showPasswordLogin
										? 'Logging in...'
										: 'Sending Magic Link...'}
								</>
							) : showPasswordLogin ? (
								'Login'
							) : (
								<>
									<Icon icon="tabler:mail" className="size-5" />
									<span>Send Magic Link</span>
								</>
							)}
						</Button>

						<div className="flex items-center">
							<hr className="flex-1" />
							<Badge variant="outline" className="bg-background uppercase">
								Or login using
							</Badge>
							<hr className="flex-1" />
						</div>

						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => setShowPasswordLogin(!showPasswordLogin)}
						>
							{showPasswordLogin ? (
								<>
									<Icon icon="tabler:mail-bolt" className="size-5" />
									<span>Login with Magic Link</span>
								</>
							) : (
								<>
									<Icon icon="tabler:lock-password" className="size-5" />
									<span>Login with Password</span>
								</>
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex justify-center">
					<div className="text-center text-sm">
						Don't have an account?{' '}
						<Link
							to="/auth/signup"
							search={{ redirect: search.redirect }}
							className="hover:underline underline-offset-4 text-accent"
						>
							Sign Up
						</Link>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
