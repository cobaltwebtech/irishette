import { Icon } from '@iconify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { changeEmail } from '@/lib/auth/auth-client';
import { refreshSession } from '@/lib/auth/session';
import { phoneNumberSchema } from '@/lib/auth/user-validation';

interface EditProfileModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: {
		id: string;
		name: string;
		email: string;
		phoneNumber?: string | null;
	};
}

export function EditProfileModal({
	open,
	onOpenChange,
	user,
}: EditProfileModalProps) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const trpc = useTRPC();
	const nameId = useId();
	const emailId = useId();
	const phoneId = useId();
	const [name, setName] = useState(user.name || '');
	const [email, setEmail] = useState(user.email || '');
	const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
	const [errors, setErrors] = useState<{
		name?: string;
		email?: string;
		phoneNumber?: string;
	}>({});

	// Name and phone (database). Email changes go through Better Auth's
	// changeEmail, which verifies the address by email first.
	const updateProfileMutation = useMutation(
		trpc.users.updateProfile.mutationOptions(),
	);
	const changeEmailMutation = useMutation({
		mutationFn: async (newEmail: string) => {
			const { error } = await changeEmail({
				newEmail,
				callbackURL: '/account',
			});
			if (error) throw new Error(error.message ?? 'Could not change email');
		},
	});

	const validateForm = () => {
		const newErrors: {
			name?: string;
			email?: string;
			phoneNumber?: string;
		} = {};

		if (!name || name.trim().length === 0) {
			newErrors.name = 'Name is required';
		}

		if (!email || email.trim().length === 0) {
			newErrors.email = 'Email is required';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			newErrors.email = 'Invalid email address';
		}

		if (phoneNumber.trim()) {
			const phone = phoneNumberSchema.safeParse(phoneNumber);
			if (!phone.success) {
				newErrors.phoneNumber = phone.error.issues[0].message;
			}
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validateForm()) {
			return;
		}

		const nameChanged = name.trim() !== user.name;
		const phoneChanged = phoneNumber.trim() !== (user.phoneNumber ?? '');
		const emailChanged =
			email.trim().toLowerCase() !== user.email.toLowerCase();
		try {
			if (nameChanged || phoneChanged) {
				await updateProfileMutation.mutateAsync({
					...(nameChanged ? { name: name.trim() } : {}),
					// An emptied field removes the number.
					...(phoneChanged ? { phoneNumber: phoneNumber.trim() || null } : {}),
				});
			}
			if (emailChanged) {
				await changeEmailMutation.mutateAsync(email.trim());
				toast.add({
					type: 'info',
					title: 'Check your email',
					description:
						'We sent a link to confirm the change. Your email stays the same until you confirm it.',
					timeout: 8000,
				});
			}
			if (nameChanged || phoneChanged) {
				// Refetch the session so the header and account page update.
				await refreshSession(queryClient, router);
				toast.add({ type: 'success', title: 'Profile updated successfully!' });
			}
			onOpenChange(false);
		} catch (error) {
			toast.add({
				type: 'error',
				title: 'Failed to update profile',
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const isLoading =
		updateProfileMutation.isPending || changeEmailMutation.isPending;

	// Reset form when dialog closes or opens
	const handleOpenChange = (newOpen: boolean) => {
		if (newOpen) {
			// Reset to current user data when opening
			setName(user.name || '');
			setEmail(user.email || '');
			setPhoneNumber(user.phoneNumber || '');
			setErrors({});
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Edit Profile</DialogTitle>
					<DialogDescription>
						Update your personal information. Click save when you're done.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						{/* Name Field */}
						<div className="grid gap-2">
							<Label htmlFor={nameId}>
								Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id={nameId}
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									if (errors.name) {
										setErrors({ ...errors, name: undefined });
									}
								}}
								placeholder="Enter your name"
								disabled={isLoading}
								className={errors.name ? 'border-red-500' : ''}
							/>
							{errors.name && (
								<p className="text-sm text-red-500">{errors.name}</p>
							)}
						</div>

						{/* Email Field */}
						<div className="grid gap-2">
							<Label htmlFor={emailId}>
								Email <span className="text-red-500">*</span>
							</Label>
							<Input
								id={emailId}
								type="email"
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (errors.email) {
										setErrors({ ...errors, email: undefined });
									}
								}}
								placeholder="Enter your email"
								disabled={isLoading}
								className={errors.email ? 'border-red-500' : ''}
							/>
							{errors.email && (
								<p className="text-sm text-red-500">{errors.email}</p>
							)}
							<p className="text-xs text-muted-foreground">
								Changing your email sends a confirmation link first.
							</p>
						</div>

						{/* Phone Number Field */}
						<div className="grid gap-2">
							<Label htmlFor={phoneId}>Phone Number</Label>
							<Input
								id={phoneId}
								type="tel"
								value={phoneNumber}
								onChange={(e) => {
									setPhoneNumber(e.target.value);
									if (errors.phoneNumber) {
										setErrors({ ...errors, phoneNumber: undefined });
									}
								}}
								placeholder="(123) 456-7890"
								disabled={isLoading}
								className={errors.phoneNumber ? 'border-red-500' : ''}
							/>
							{errors.phoneNumber && (
								<p className="text-sm text-red-500">{errors.phoneNumber}</p>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading && (
								<Icon icon="tabler:loader-2" className="animate-spin" />
							)}
							Save Changes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
