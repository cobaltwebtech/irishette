import { Icon } from '@iconify/react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';
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

export const Route = createFileRoute('/auth/reset-password')({
	head: () => ({
		meta: [
			{
				title: 'Reset Password | Irishette.com',
			},
		],
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState('');
	const [token, setToken] = useState<string | null>(null);
	const newPasswordId = useId();
	const confirmPasswordId = useId();
	const router = useRouter();

	// Get token from URL on mount
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const tokenParam = urlParams.get('token');
		if (!tokenParam) {
			setError('Invalid or missing reset token');
			toast.error('Invalid or missing reset token');
		} else {
			setToken(tokenParam);
		}
	}, []);

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
							<Link to="/auth/login">
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
								disabled={isLoading || !token}
								autoComplete="new-password"
								placeholder="Enter new password"
							/>
							<p className="text-xs text-muted-foreground">
								Must be at least 8 characters with uppercase, lowercase, and a
								number
							</p>
						</div>

						<div className="grid gap-3">
							<Label htmlFor={confirmPasswordId}>Confirm Password</Label>
							<PasswordInput
								id={confirmPasswordId}
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								disabled={isLoading || !token}
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
							disabled={isLoading || !token || !newPassword || !confirmPassword}
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
							href="/auth/login"
							className="text-accent underline-offset-4 hover:underline"
						>
							Back to Login
						</Link>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
