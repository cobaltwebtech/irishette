import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
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
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { updateUser } from '@/lib/auth-client';

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

	// Reset form when user data changes
	useEffect(() => {
		setName(user.name || '');
		setEmail(user.email || '');
		setPhoneNumber(user.phoneNumber || '');
		setErrors({});
	}, [user]);

	// tRPC mutation for updating profile in database
	const updateProfileMutation = useMutation({
		mutationFn: async (data: {
			userId: string;
			name?: string;
			email?: string;
			phoneNumber?: string;
		}) => {
			return await trpcClient.users.updateProfile.mutate(data);
		},
		onSuccess: async () => {
			// Invalidate queries to refetch updated data
			await queryClient.invalidateQueries({ queryKey: ['session'] });
			toast.success('Profile updated successfully!');
			onOpenChange(false);
		},
		onError: (error) => {
			console.error('Failed to update profile:', error);
			toast.error('Failed to update profile. Please try again.');
		},
	});

	// Better Auth mutation for updating user (this updates the session)
	const updateBetterAuthUser = useMutation({
		mutationFn: async (data: { name?: string; image?: string }) => {
			return await updateUser(data);
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

		if (phoneNumber && phoneNumber.trim().length > 0) {
			const digitsOnly = phoneNumber.replace(/\D/g, '');
			if (digitsOnly.length < 10) {
				newErrors.phoneNumber = 'Phone number must be at least 10 digits';
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

		try {
			// Update via tRPC (updates database)
			const updateData: {
				userId: string;
				name?: string;
				email?: string;
				phoneNumber?: string;
			} = {
				userId: user.id,
			};

			if (name !== user.name) {
				updateData.name = name;
			}
			if (email !== user.email) {
				updateData.email = email;
			}
			if (phoneNumber !== user.phoneNumber) {
				updateData.phoneNumber = phoneNumber;
			}

			// Update database via tRPC
			await updateProfileMutation.mutateAsync(updateData);

			// Update Better Auth session for name changes
			if (name !== user.name) {
				await updateBetterAuthUser.mutateAsync({ name });
			}
		} catch (error) {
			console.error('Error updating profile:', error);
		}
	};

	const isLoading =
		updateProfileMutation.isPending || updateBetterAuthUser.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
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
								Note: Changing your email may require verification.
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
							{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Save Changes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
