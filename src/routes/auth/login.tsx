import { createFileRoute, useRouter } from '@tanstack/react-router';
import { CheckCircle2, CircleX, Loader2, Mail } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
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
import { authClient, signIn, useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/auth/login')({
	head: () => ({
		meta: [
			{
				title: 'Login | Irishette.com',
			},
		],
	}),
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

	const { data: session } = useSession();
	const router = useRouter();

	// Redirect if already logged in
	useEffect(() => {
		if (session) {
			router.navigate({ to: '/account' });
		}
	}, [session, router]);

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
				callbackURL: '/account',
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
				callbackURL: '/account',
				rememberMe: true,
			});

			if (response && !response.error) {
				toast.success('Login successful!');
				router.navigate({ to: '/account' });
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
			<div className="min-h-screen bg-background flex items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
							<CheckCircle2 className="w-6 h-6 text-green-600" />
						</div>
						<CardTitle>Check Your Email</CardTitle>
						<CardDescription>
							We've sent a magic link to <strong>{email}</strong>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-center">
							Click the link in your email to sign in to your Irishette account.
							The link will expire in 15 minutes.
						</p>
						<Button
							variant="outline"
							onClick={() => {
								setEmailSent(false);
								setEmail('');
								setError('');
							}}
							className="w-full"
						>
							Send Another Link
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background flex items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
						<Mail className="w-6 h-6 text-primary" />
					</div>
					<CardTitle>Welcome Back</CardTitle>
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
						<div className="grid gap-3">
							<Label htmlFor={emailInputId}>Email</Label>
							<Input
								id={emailInputId}
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Enter your email address"
								className="w-full"
								required
								disabled={isLoading}
								autoComplete="email"
							/>
						</div>

						{showPasswordLogin && (
							<div className="grid gap-3">
								<div className="flex items-center">
									<Label htmlFor={passwordInputId}>Password</Label>
									<a
										href="/auth/forgot-password"
										className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
									>
										Forgot your password?
									</a>
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
								<CircleX className="size-4" />
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
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{showPasswordLogin
										? 'Logging in...'
										: 'Sending Magic Link...'}
								</>
							) : showPasswordLogin ? (
								'Login'
							) : (
								<>
									<Mail className="size-4" />
									<span>Send Magic Link</span>
								</>
							)}
						</Button>

						<div className="relative my-4">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t" />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-background text-muted-foreground px-2">
									Or continue with
								</span>
							</div>
						</div>

						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => setShowPasswordLogin(!showPasswordLogin)}
						>
							{showPasswordLogin
								? 'Login with Magic Link'
								: 'Login with Password'}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex justify-center">
					<div className="text-center text-sm">
						Don't have an account?{' '}
						<a
							href="/signup"
							className="underline underline-offset-4 hover:text-primary"
						>
							Sign Up
						</a>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
