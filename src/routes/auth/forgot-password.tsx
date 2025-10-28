import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
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
import { authClient } from '@/lib/auth-client';
import { requireNoSession } from '@/utils/auth-check';

export const Route = createFileRoute('/auth/forgot-password')({
	head: () => ({
		meta: [
			{
				title: 'Forgot Password | Irishette.com',
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
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [email, setEmail] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState('');
	const emailInputId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!email) {
			setError('Email is required');
			toast.error('Email is required');
			return;
		}

		setIsLoading(true);
		setError('');

		try {
			await authClient.forgetPassword({
				email,
				redirectTo: '/auth/reset-password',
			});
			setIsSuccess(true);
			toast.success('Password reset link sent to your email!');
		} catch (err: unknown) {
			console.error('Password reset request failed:', err);
			const message =
				err instanceof Error
					? err.message
					: 'Failed to process password reset request. Please try again.';
			setError(message);
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	};

	if (isSuccess) {
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
							Click the link in your email to reset your password. The link will
							expire in 15 minutes.
						</p>
						<Button
							variant="secondary"
							onClick={() => {
								setIsSuccess(false);
								setEmail('');
								setError('');
							}}
							className="w-full"
						>
							← Try Another Email
						</Button>
					</CardContent>
					<CardFooter className="flex justify-center">
						<div className="text-sm">
							Remember your password?{' '}
							<Link
								to="/auth/login"
								className="text-accent underline-offset-4 hover:underline"
								search={{ redirect: '/account' }}
							>
								Back to Login
							</Link>
						</div>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="flex items-center justify-center mb-4 mx-auto size-16 bg-primary rounded-full">
						<Icon
							icon="tabler:lock-cog"
							className="size-10 text-primary-foreground"
						/>
					</div>
					<CardTitle className="text-2xl font-bold">
						Forgot Your Password
					</CardTitle>
					<CardDescription>
						Enter your email address and we'll send you a link to reset your
						password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="flex flex-col gap-2">
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
									Sending Reset Link...
								</>
							) : (
								<>
									<Icon icon="tabler:mail-share" className="size-5" />
									Send Reset Link
								</>
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex justify-center">
					<div className="text-sm">
						Remember your password?{' '}
						<Link
							to="/auth/login"
							className="text-accent underline-offset-4 hover:underline"
							search={{ redirect: '/account' }}
						>
							Back to Login
						</Link>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
