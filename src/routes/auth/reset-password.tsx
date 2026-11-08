import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';
import { requireNoSession } from '@/lib/auth-check';
import { authClient } from '@/lib/auth-client';
import {
	formatLinkLifetime,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-constants';
import { authLinkErrorMessage, isLinkError } from '@/lib/auth-errors';
import { firstIssue, passwordSchema } from '@/lib/auth-validation';

// Better Auth redirects the email link here with ?token=... (valid) or
// ?error=INVALID_TOKEN (invalid or expired).
const searchSchema = z.object({
	token: z.string().trim().min(1).max(500).optional().catch(undefined),
	error: z.string().max(100).optional().catch(undefined),
});

export const Route = createFileRoute('/auth/reset-password')({
	head: () => ({
		meta: [{ title: 'Reset Password | Irishette.com' }],
	}),
	validateSearch: searchSchema,
	// Signed-in users change their password from account settings instead.
	beforeLoad: ({ context }) => requireNoSession({ context, search: {} }),
	component: ResetPasswordPage,
});

function RequestNewLink({ message }: { message: string }) {
	return (
		<AuthCard
			icon="tabler:alert-circle"
			title="Invalid Reset Link"
			description={message}
			footer={<BackToLogin />}
		>
			<p className="text-center text-muted-foreground">
				Reset links work once and expire after{' '}
				{formatLinkLifetime(PASSWORD_RESET_EXPIRES_IN)}. Request a new one to
				continue.
			</p>
			<Button asChild className="w-full">
				<Link to="/auth/forgot-password" search={{ redirect: undefined }}>
					<Icon icon="tabler:mail-share" className="size-5" />
					Request a new reset link
				</Link>
			</Button>
		</AuthCard>
	);
}

function BackToLogin() {
	return (
		<p>
			Remember your password?{' '}
			<Link
				to="/auth/login"
				className="text-accent underline-offset-4 hover:underline"
				search={{ redirect: undefined, error: undefined }}
			>
				Back to Login
			</Link>
		</p>
	);
}

function ResetPasswordPage() {
	const search = Route.useSearch();
	const newPasswordId = useId();
	const confirmPasswordId = useId();
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { isLoading, error, setError, run } = useAuthRequest();
	const [linkError, setLinkError] = useState(search.error ?? '');
	const [isSuccess, setIsSuccess] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!search.token) return;
		const parsed = passwordSchema.safeParse({ password: newPassword });
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		if (newPassword !== confirmPassword) {
			setError('Passwords do not match');
			return;
		}
		const token = search.token;
		await run(
			() =>
				authClient.resetPassword({ newPassword: parsed.data.password, token }),
			{
				// An invalid or expired token: show "request a new link".
				onError: (resetError) => {
					if (resetError.code && isLinkError(resetError.code)) {
						setLinkError(resetError.code);
					}
				},
				onSuccess: () => setIsSuccess(true),
			},
		);
	};

	if (isSuccess) {
		return (
			<AuthCard
				icon="tabler:lock-check"
				title="Password Reset Successful"
				description="Your password has been reset."
			>
				<p className="text-center text-muted-foreground">
					You can now log in with your new password.
				</p>
				<Button asChild className="w-full">
					<Link
						to="/auth/login"
						search={{ redirect: undefined, error: undefined }}
					>
						<Icon icon="tabler:login-2" className="size-5" />
						Return to Login
					</Link>
				</Button>
			</AuthCard>
		);
	}

	if (linkError || !search.token) {
		return (
			<RequestNewLink
				message={
					linkError
						? authLinkErrorMessage(linkError)
						: 'This password reset link is incomplete.'
				}
			/>
		);
	}

	return (
		<AuthCard
			icon="tabler:lock-cog"
			title="Reset Your Password"
			description="Enter your new password below."
			footer={<BackToLogin />}
		>
			<form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
						At least 8 characters with upper case, lower case and a number.
					</p>
				</div>
				<div className="flex flex-col gap-2">
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

				<AuthError message={error} />

				<Button
					type="submit"
					className="w-full"
					disabled={isLoading || !newPassword || !confirmPassword}
				>
					{isLoading ? (
						<>
							<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
							Resetting password...
						</>
					) : (
						<>
							<Icon icon="tabler:lock-password" className="size-5" />
							Reset password
						</>
					)}
				</Button>
			</form>
		</AuthCard>
	);
}
