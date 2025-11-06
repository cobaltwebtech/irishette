import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';
import { authClient } from '@/lib/auth-client';
import { passwordSchema } from '@/lib/auth-validation';
import { requireNoSession } from '@/utils/auth-check';

export const Route = createFileRoute('/auth/reset-password')({
	head: () => ({
		meta: [
			{
				title: 'Reset Password | Irishette.com',
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) => {
		return {
			token: (search.token as string) || null,
		};
	},
	beforeLoad: async () => {
		// Prevent logged-in users from accessing this route
		// They should use account settings to change password
		await requireNoSession('/account');
	},
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	// Get token from validated search params (type-safe and SSR-friendly)
	const { token } = Route.useSearch();

	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState('');
	const newPasswordId = useId();
	const confirmPasswordId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!token) {
			setError('Invalid or missing token');
			toast.error('Invalid or missing token');
			return;
		}

		if (!newPassword || !confirmPassword) {
			setError('Both password fields are required');
			toast.error('Both password fields are required');
			return;
		}

		if (newPassword !== confirmPassword) {
			setError('Passwords do not match');
			toast.error('Passwords do not match');
			return;
		}

		// Validate password using the schema
		try {
			passwordSchema.parse({ password: newPassword });
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
			await authClient.resetPassword({
				newPassword,
				token,
			});
			setIsSuccess(true);
			toast.success('Password has been reset successfully!');
		} catch (err: unknown) {
			console.error('Password reset failed:', err);
			const message =
				err instanceof Error
					? err.message
					: 'Failed to reset password. Please try again or request a new reset link.';
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
								icon="tabler:lock-check"
								className="size-10 text-primary-foreground"
							/>
						</div>
						<CardTitle className="text-2xl font-bold">
							Password Reset Successful
						</CardTitle>
						<CardDescription>
							Your password has been reset successfully.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col items-center justify-center gap-4">
						<p className="text-muted-foreground">
							You may now log in with your new password.
						</p>
						<Button asChild className="w-full">
							<Link to="/auth/login" search={{ redirect: '/account' }}>
								<Icon icon="tabler:login-2" className="size-5" />
								Return to Login
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				{!token ? (
					// Show error state when token is missing
					<>
						<CardHeader className="text-center">
							<div className="flex items-center justify-center mb-4 mx-auto size-16 bg-destructive rounded-full">
								<Icon
									icon="tabler:alert-circle"
									className="size-10 text-destructive-foreground"
								/>
							</div>
							<CardTitle className="text-2xl font-bold">
								Invalid Reset Link
							</CardTitle>
							<CardDescription>
								The password reset link is invalid or has expired.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-muted-foreground text-center">
								Please request a new password reset link to continue.
							</p>
							<Button asChild className="w-full">
								<Link
									to="/auth/forgot-password"
									search={{ redirect: '/account' }}
								>
									<Icon icon="tabler:mail-share" className="size-5" />
									Request New Reset Link
								</Link>
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
					</>
				) : (
					// Show password reset form when token is valid
					<>
						<CardHeader className="text-center">
							<div className="flex items-center justify-center mb-4 mx-auto size-16 bg-primary rounded-full">
								<Icon
									icon="tabler:lock-cog"
									className="size-10 text-primary-foreground"
								/>
							</div>
							<CardTitle className="text-2xl font-bold">
								Reset Your Password
							</CardTitle>
							<CardDescription>Enter your new password below</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit} className="space-y-4">
								<div className="flex flex-col gap-2">
									<Label htmlFor={newPasswordId}>New Password</Label>
									<PasswordInput
										id={newPasswordId}
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										disabled={isLoading}
										autoComplete="new-password"
										placeholder="Enter new password"
									/>
									<p className="text-xs text-muted-foreground">
										Must be at least 8 characters with uppercase, lowercase, and
										a number
									</p>
								</div>

								<div className="grid gap-3">
									<Label htmlFor={confirmPasswordId}>Confirm Password</Label>
									<PasswordInput
										id={confirmPasswordId}
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										disabled={isLoading}
										autoComplete="new-password"
										placeholder="Confirm new password"
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
									disabled={isLoading || !newPassword || !confirmPassword}
								>
									{isLoading ? (
										<>
											<Icon
												icon="tabler:loader-2"
												className="size-5 animate-spin"
											/>
											Resetting Password...
										</>
									) : (
										<>
											<Icon icon="tabler:lock-password" className="size-5" />
											Reset Password
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
					</>
				)}
			</Card>
		</div>
	);
}
