import { createFileRoute, useRouter } from '@tanstack/react-router';
import { CheckCircle2, CircleX, KeyRound, Loader2 } from 'lucide-react';
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
			<div className="min-h-screen bg-background flex items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
							<CheckCircle2 className="w-6 h-6 text-green-600" />
						</div>
						<CardTitle>Password Reset Complete</CardTitle>
						<CardDescription>
							Your password has been reset successfully
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-center">
							You can now log in with your new password.
						</p>
						<Button
							onClick={() => router.navigate({ to: '/auth/login' })}
							className="w-full"
						>
							Return to Login
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
						<KeyRound className="w-6 h-6 text-primary" />
					</div>
					<CardTitle>Reset Your Password</CardTitle>
					<CardDescription>Enter your new password below</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="grid gap-3">
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
								<CircleX className="size-4" />
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
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Resetting Password...
								</>
							) : (
								'Reset Password'
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex justify-center">
					<div className="text-center text-sm">
						Remember your password?{' '}
						<a
							href="/auth/login"
							className="underline underline-offset-4 hover:text-primary"
						>
							Back to Login
						</a>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
