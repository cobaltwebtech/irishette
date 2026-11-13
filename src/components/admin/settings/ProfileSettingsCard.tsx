import { Icon } from '@iconify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { refreshSession } from '@/lib/auth/session';
import { updateProfileSchema } from '@/lib/auth/user-validation';

/** Name and phone number (tRPC users.updateProfile). */
export function ProfileSettingsCard({
	profile,
}: {
	profile: { name: string; phoneNumber: string | null };
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const ids = { name: useId(), phone: useId() };
	const [name, setName] = useState(profile.name);
	const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '');
	const [error, setError] = useState('');

	const update = useMutation(trpc.users.updateProfile.mutationOptions());

	const nameChanged = name.trim() !== profile.name;
	const phoneChanged = phoneNumber.trim() !== (profile.phoneNumber ?? '');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		const input = {
			...(nameChanged ? { name } : {}),
			// An emptied field removes the number.
			...(phoneChanged ? { phoneNumber: phoneNumber.trim() || null } : {}),
		};
		const parsed = updateProfileSchema.safeParse(input);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? 'Please check the form.');
			return;
		}
		try {
			await update.mutateAsync(parsed.data);
			await queryClient.invalidateQueries(
				trpc.users.adminGetAccountSettings.queryFilter(),
			);
			// The sidebar and header read the session.
			await refreshSession(queryClient, router);
			toast.add({ type: 'success', title: 'Profile updated' });
		} catch (updateError) {
			setError(
				updateError instanceof Error
					? updateError.message
					: 'Could not update your profile.',
			);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:user-circle" className="size-5" />
					Profile
				</CardTitle>
				<CardDescription>
					Your name and phone number. Guests never see them.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor={ids.name}>Name</Label>
						<Input
							id={ids.name}
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoComplete="name"
							disabled={update.isPending}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={ids.phone}>Phone number</Label>
						<Input
							id={ids.phone}
							type="tel"
							value={phoneNumber}
							onChange={(e) => setPhoneNumber(e.target.value)}
							autoComplete="tel"
							placeholder="(123) 456-7890"
							disabled={update.isPending}
						/>
						<p className="text-xs text-muted-foreground">
							Optional. Leave empty to remove it.
						</p>
					</div>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					<Button
						type="submit"
						disabled={update.isPending || (!nameChanged && !phoneChanged)}
					>
						{update.isPending && (
							<Icon icon="tabler:loader-2" className="animate-spin" />
						)}
						Save profile
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
