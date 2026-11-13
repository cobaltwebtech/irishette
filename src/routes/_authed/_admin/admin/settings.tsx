import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { EmailSettingsCard } from '@/components/admin/settings/EmailSettingsCard';
import { NotificationSettingsCard } from '@/components/admin/settings/NotificationSettingsCard';
import { PasswordSettingsCard } from '@/components/admin/settings/PasswordSettingsCard';
import { ProfileSettingsCard } from '@/components/admin/settings/ProfileSettingsCard';
import { useTRPC } from '@/integrations/trpc/react';

// The signed-in admin's own account: profile, email, password and email
// notifications. Auth: the _authed/_admin layout (adminProcedure on the server).
export const Route = createFileRoute('/_authed/_admin/admin/settings')({
	head: () => ({
		meta: [{ title: 'Account Settings | Irishette.com' }],
	}),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.users.adminGetAccountSettings.queryOptions(),
		),
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(
		trpc.users.adminGetAccountSettings.queryOptions(),
	);

	return (
		<AdminLayout title="Account Settings">
			<div className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-6">
					<ProfileSettingsCard
						// Remount with fresh values after a save elsewhere.
						key={`${data.profile.name}|${data.profile.phoneNumber ?? ''}`}
						profile={data.profile}
					/>
					<EmailSettingsCard profile={data.profile} />
					<PasswordSettingsCard hasPassword={data.hasPassword} />
				</div>
				<div>
					<NotificationSettingsCard notifications={data.notifications} />
				</div>
			</div>
		</AdminLayout>
	);
}
