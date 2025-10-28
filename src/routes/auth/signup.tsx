import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { authClient, signUp } from '@/lib/auth-client';
import { emailSchema, registerSchema } from '@/lib/auth-validation';
import { requireNoSession } from '@/utils/auth-check';

export const Route = createFileRoute('/auth/signup')({
	head: () => ({
		meta: [
			{
				title: 'Sign Up for New Account | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ search }) => {
		// Prevent logged-in users from accessing signup page
		// Redirect to /account or the specified redirect param
		await requireNoSession(search.redirect);
	},
	validateSearch: (search: Record<string, unknown>) => {
		return {
			redirect: (search.redirect as string) || '/account',
		};
	},
	component: SignupPage,
});

function SignupPage() {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [error, setError] = useState('');
	const [showPasswordSignup, setShowPasswordSignup] = useState(false);
	const nameInputId = useId();
	const emailInputId = useId();
	const passwordInputId = useId();
	const confirmPasswordInputId = useId();

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

	const handleMagicLinkSignUp = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!email) {
			setError('Email is required');
			toast.error('Email is required');
			return;
		}

		// Validate email using schema
		try {
			emailSchema.parse({ email });
		} catch (err) {
			if (err instanceof z.ZodError) {
				const errorMessage = err.issues[0].message;
				setError(errorMessage);
				toast.error(errorMessage);
				return;
			}
		}

		setIsLoading(true);
		setError('');

		try {
			await authClient.signIn.magicLink({
				email,
				callbackURL: search.redirect,
			});
			setEmailSent(true);
			toast.success('Magic link sent! Check your email to complete signup.');
		} catch (err: unknown) {
			console.error('Magic link sign-up error:', err);
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

	const handlePasswordSignUp = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!name || !email || !password || !confirmPassword) {
			setError('All fields are required');
			toast.error('All fields are required');
			return;
		}

		// Validate using schema
		try {
			registerSchema.parse({ name, email, password, confirmPassword });
		} catch (err) {
			if (err instanceof z.ZodError) {
				const errorMessage = err.issues[0].message;
				setError(errorMessage);
				toast.error(errorMessage);
				return;
			}
		}

		setIsLoading(true);
		setError('');

		try {
			const response = await signUp.email({
				name,
				email,
				password,
				callbackURL: search.redirect,
			});

			if (response && !response.error) {
				toast.success(
					'Account created! Please check your email to verify your account.',
				);
				setEmailSent(true);
				return;
			}

			if (response.error) {
				const errorMsg =
					response.error.message || 'Sign up failed. Please try again.';
				setError(errorMsg);
				toast.error(errorMsg);
				return;
			}
		} catch (error) {
			console.error('Sign up failed', error);
			const errorMsg =
				error instanceof Error
					? error.message
					: 'Sign up failed. Please try again.';
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
							<p>We have sent a verification email to:</p>
							<p className="font-semibold">{email}</p>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-center">
							{showPasswordSignup
								? 'Please verify your email address by clicking the link we sent you. The link will expire in 15 minutes.'
								: 'Click the magic link in your email to complete your signup and sign in to your Irishette account. The link will expire in 15 minutes.'}
						</p>
						<div className="flex flex-auto flex-wrap items-center justify-center gap-4">
							<Button
								variant="secondary"
								onClick={() => {
									setEmailSent(false);
									setError('');
								}}
								className="flex-1"
							>
								<Icon icon="tabler:mail-share" className="size-5" />
								Resend Email
							</Button>
							<Button
								className="flex-1"
								variant="outline"
								onClick={() => {
									setEmailSent(false);
									setName('');
									setEmail('');
									setPassword('');
									setConfirmPassword('');
									setError('');
									setShowPasswordSignup(false);
								}}
							>
								← Go Back
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
							icon="tabler:user-plus"
							className="size-10 text-primary-foreground"
						/>
					</div>
					<CardTitle className="text-2xl font-bold">
						Sign Up for New Account
					</CardTitle>
					<CardDescription>
						{showPasswordSignup
							? 'Create your account with email and password. You will need to verify your email address.'
							: 'Enter your email address to receive a Magic Link and create your account without a password.'}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={
							showPasswordSignup ? handlePasswordSignUp : handleMagicLinkSignUp
						}
						className="space-y-4"
					>
						{showPasswordSignup && (
							<div className="flex flex-col gap-2">
								<Label htmlFor={nameInputId}>Name</Label>
								<Input
									id={nameInputId}
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Enter your full name"
									required
									disabled={isLoading}
									autoComplete="name"
								/>
							</div>
						)}

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

						{showPasswordSignup && (
							<div className="flex flex-col gap-2">
								<Label htmlFor={passwordInputId}>Password</Label>
								<PasswordInput
									id={passwordInputId}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="At least 8 characters"
									required
									disabled={isLoading}
									autoComplete="new-password"
								/>
								<p className="text-xs text-muted-foreground">
									Must contain uppercase, lowercase, and a number
								</p>
							</div>
						)}

						{showPasswordSignup && (
							<div className="flex flex-col gap-2">
								<Label htmlFor={confirmPasswordInputId}>Confirm Password</Label>
								<PasswordInput
									id={confirmPasswordInputId}
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="Re-enter your password"
									required
									disabled={isLoading}
									autoComplete="new-password"
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
									{showPasswordSignup
										? 'Creating Account...'
										: 'Sending Magic Link...'}
								</>
							) : showPasswordSignup ? (
								'Create Account'
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
								Or sign up using
							</Badge>
							<hr className="flex-1" />
						</div>

						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => setShowPasswordSignup(!showPasswordSignup)}
						>
							{showPasswordSignup ? (
								<>
									<Icon icon="tabler:mail-bolt" className="size-5" />
									<span>Sign Up with Magic Link</span>
								</>
							) : (
								<>
									<Icon icon="tabler:lock-password" className="size-5" />
									<span>Sign Up with Password</span>
								</>
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex justify-center">
					<div className="text-center text-sm">
						Already have an account?{' '}
						<Link
							to="/auth/login"
							search={{ redirect: search.redirect }}
							className="hover:underline underline-offset-4 text-accent"
						>
							Login Here
						</Link>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
