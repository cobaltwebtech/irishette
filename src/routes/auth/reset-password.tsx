import { Icon } from '@iconify/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { PasswordField } from '@/components/auth/PasswordField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { buttonVariants } from '@/components/ui/button';
import { requireNoSession } from '@/lib/auth/auth-check';
import { authClient } from '@/lib/auth/auth-client';
import {
	formatLinkLifetime,
	PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth/auth-constants';
import { authLinkErrorMessage, isLinkError } from '@/lib/auth/auth-errors';
import { passwordSchema } from '@/lib/auth/auth-validation';
import { cn } from '@/utils/twMerge';

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
			<Link
				to="/auth/forgot-password"
				search={{ redirect: undefined }}
				data-slot="button"
				className={cn(buttonVariants(), 'w-full')}
			>
				<Icon icon="tabler:mail-share" className="size-5" />
				Request a new reset link
			</Link>
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
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { isLoading, error, setError, run, validate } = useAuthRequest();
	const [linkError, setLinkError] = useState(search.error ?? '');
	const [isSuccess, setIsSuccess] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!search.token) return;
		const data = validate(passwordSchema, { password: newPassword });
		if (!data) return;
		if (newPassword !== confirmPassword) {
			setError('Passwords do not match');
			return;
		}
		const token = search.token;
		await run(
			() => authClient.resetPassword({ newPassword: data.password, token }),
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
				<Link
					to="/auth/login"
					search={{ redirect: undefined, error: undefined }}
					data-slot="button"
					className={cn(buttonVariants(), 'w-full')}
				>
					<Icon icon="tabler:login-2" className="size-5" />
					Return to Login
				</Link>
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
				<PasswordField
					label="New Password"
					hint="At least 8 characters with upper case, lower case and a number."
					value={newPassword}
					onChange={setNewPassword}
					disabled={isLoading}
					autoComplete="new-password"
					placeholder="Enter new password"
				/>
				<PasswordField
					label="Confirm Password"
					value={confirmPassword}
					onChange={setConfirmPassword}
					disabled={isLoading}
					autoComplete="new-password"
					placeholder="Confirm new password"
				/>

				<AuthError message={error} />

				<AuthSubmitButton
					isLoading={isLoading}
					disabled={!newPassword || !confirmPassword}
					loadingLabel="Resetting password..."
					icon="tabler:lock-password"
				>
					Reset password
				</AuthSubmitButton>
			</form>
		</AuthCard>
	);
}
