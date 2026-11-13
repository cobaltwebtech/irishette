import { Icon } from '@iconify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useState } from 'react';

import { PasswordField } from '@/components/auth/PasswordField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { changePassword } from '@/lib/auth/auth-client';
import {
	changePasswordSchema,
	firstIssue,
	setPasswordSchema,
} from '@/lib/auth/auth-validation';
import { refreshSession } from '@/lib/auth/session';

const PASSWORD_HINT =
	'At least 8 characters, with an upper case letter, a lower case letter and a number.';

/**
 * Change the password (Better Auth changePassword, which checks the current
 * one) or, for an account that signs in by magic link only, set a first one
 * (tRPC users.adminSetPassword, Better Auth's server-only setPassword).
 */
export function PasswordSettingsCard({
	hasPassword,
}: {
	hasPassword: boolean;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:lock" className="size-5" />
					Password
				</CardTitle>
				<CardDescription>
					{hasPassword
						? 'Change the password you sign in with. Magic links keep working.'
						: 'You sign in with magic links. Set a password to also sign in with your email and a password.'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />}
			</CardContent>
		</Card>
	);
}

function ChangePasswordForm() {
	const queryClient = useQueryClient();
	const router = useRouter();
	const signOutOthersId = useId();
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
	const { isLoading, error, run, validate } = useAuthRequest();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = validate(changePasswordSchema, {
			currentPassword,
			newPassword,
			confirmPassword,
		});
		if (!parsed) return;
		await run(
			() =>
				changePassword({
					currentPassword: parsed.currentPassword,
					newPassword: parsed.newPassword,
					revokeOtherSessions,
				}),
			{
				onSuccess: async () => {
					setCurrentPassword('');
					setNewPassword('');
					setConfirmPassword('');
					// Signing out other devices gives this one a new session cookie.
					await refreshSession(queryClient, router);
					toast.add({
						type: 'success',
						title: 'Password changed',
						description: revokeOtherSessions
							? 'Your other devices were signed out.'
							: undefined,
					});
				},
			},
		);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<PasswordField
				label="Current password"
				value={currentPassword}
				onChange={setCurrentPassword}
				disabled={isLoading}
				autoComplete="current-password"
				required
			/>
			<PasswordField
				label="New password"
				hint={PASSWORD_HINT}
				value={newPassword}
				onChange={setNewPassword}
				disabled={isLoading}
				autoComplete="new-password"
				required
			/>
			<PasswordField
				label="Confirm new password"
				value={confirmPassword}
				onChange={setConfirmPassword}
				disabled={isLoading}
				autoComplete="new-password"
				required
			/>
			<div className="flex items-center gap-2">
				<Checkbox
					id={signOutOthersId}
					checked={revokeOtherSessions}
					onCheckedChange={(checked) =>
						setRevokeOtherSessions(checked === true)
					}
					disabled={isLoading}
				/>
				<Label htmlFor={signOutOthersId} className="font-normal">
					Sign out of all other devices
				</Label>
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			<Button type="submit" disabled={isLoading}>
				{isLoading && <Icon icon="tabler:loader-2" className="animate-spin" />}
				Change password
			</Button>
		</form>
	);
}

function SetPasswordForm() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const setPassword = useMutation(
		trpc.users.adminSetPassword.mutationOptions(),
	);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		const parsed = setPasswordSchema.safeParse({ newPassword });
		if (!parsed.success) {
			setError(firstIssue(parsed.error));
			return;
		}
		if (newPassword !== confirmPassword) {
			setError('Passwords do not match');
			return;
		}
		try {
			await setPassword.mutateAsync(parsed.data);
			setNewPassword('');
			setConfirmPassword('');
			// hasPassword flips, which shows the change form.
			await queryClient.invalidateQueries(
				trpc.users.adminGetAccountSettings.queryFilter(),
			);
			toast.add({ type: 'success', title: 'Password set' });
		} catch (mutationError) {
			setError(
				mutationError instanceof Error
					? mutationError.message
					: 'Could not set your password.',
			);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<PasswordField
				label="New password"
				hint={PASSWORD_HINT}
				value={newPassword}
				onChange={setNewPassword}
				disabled={setPassword.isPending}
				autoComplete="new-password"
				required
			/>
			<PasswordField
				label="Confirm new password"
				value={confirmPassword}
				onChange={setConfirmPassword}
				disabled={setPassword.isPending}
				autoComplete="new-password"
				required
			/>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			<Button type="submit" disabled={setPassword.isPending}>
				{setPassword.isPending && (
					<Icon icon="tabler:loader-2" className="animate-spin" />
				)}
				Set password
			</Button>
		</form>
	);
}
