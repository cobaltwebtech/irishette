import { Icon } from '@iconify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import {
	NOTIFICATION_CATEGORY_INFO,
	type NotificationCategory,
	notificationCategories,
} from '@/lib/email/notification-categories';
import { CONTACT_EMAIL } from '@/lib/site';

/**
 * Admin email notifications on or off per category. Each switch saves at once
 * (tRPC users.adminUpdateNotificationPreferences) and shows the new value
 * while the request runs.
 */
export function NotificationSettingsCard({
	notifications,
}: {
	notifications: Record<NotificationCategory, boolean>;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const update = useMutation(
		trpc.users.adminUpdateNotificationPreferences.mutationOptions({
			onSuccess: (saved) => {
				queryClient.setQueryData(
					trpc.users.adminGetAccountSettings.queryKey(),
					(old) => (old ? { ...old, notifications: saved } : old),
				);
			},
			onError: (error) => {
				toast.add({
					type: 'error',
					title: 'Could not save the setting',
					description: error.message,
				});
			},
		}),
	);

	const pending = update.isPending ? update.variables.preferences : {};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:bell" className="size-5" />
					Email notifications
				</CardTitle>
				<CardDescription>
					Choose which emails you get. Each change saves right away and only
					affects you, not other admins. Problems are still listed under{' '}
					<Link to="/admin/inbox" className="underline">
						Notifications
					</Link>{' '}
					in this dashboard, and contact form messages always go to{' '}
					{CONTACT_EMAIL}.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="divide-y">
					{notificationCategories.map((category) => (
						<NotificationRow
							key={category}
							category={category}
							checked={pending[category] ?? notifications[category]}
							disabled={update.isPending}
							onChange={(emailEnabled) =>
								update.mutate({ preferences: { [category]: emailEnabled } })
							}
						/>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}

function NotificationRow({
	category,
	checked,
	disabled,
	onChange,
}: {
	category: NotificationCategory;
	checked: boolean;
	disabled: boolean;
	onChange: (checked: boolean) => void;
}) {
	const id = useId();
	const descriptionId = useId();
	const { label, description } = NOTIFICATION_CATEGORY_INFO[category];
	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="space-y-0.5">
				<Label htmlFor={id}>{label}</Label>
				<p id={descriptionId} className="text-sm text-muted-foreground">
					{description}
				</p>
			</div>
			<Switch
				id={id}
				aria-describedby={descriptionId}
				checked={checked}
				onCheckedChange={onChange}
				disabled={disabled}
			/>
		</li>
	);
}
