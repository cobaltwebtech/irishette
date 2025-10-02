import { createFileRoute } from '@tanstack/react-router';
import { CheckCircle2, CircleX, KeyRound, Loader2 } from 'lucide-react';
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

export const Route = createFileRoute('/auth/forgot-password')({
	head: () => ({
		meta: [
			{
				title: 'Forgot Password | Irishette.com',
			},
		],
	}),
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
			<div className="min-h-screen bg-background flex items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
							<CheckCircle2 className="w-6 h-6 text-green-600" />
						</div>
						<CardTitle>Check Your Email</CardTitle>
						<CardDescription>
							We've sent a password reset link to <strong>{email}</strong>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-center">
							Click the link in your email to reset your password. The link will
							expire in 15 minutes.
						</p>
						<Button
							variant="outline"
							onClick={() => {
								setIsSuccess(false);
								setEmail('');
								setError('');
							}}
							className="w-full"
						>
							Try Another Email
						</Button>
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

	return (
		<div className="min-h-screen bg-background flex items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
						<KeyRound className="w-6 h-6 text-primary" />
					</div>
					<CardTitle>Reset Your Password</CardTitle>
					<CardDescription>
						Enter your email address and we'll send you a link to reset your
						password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
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
									Sending Reset Link...
								</>
							) : (
								'Send Reset Link'
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
