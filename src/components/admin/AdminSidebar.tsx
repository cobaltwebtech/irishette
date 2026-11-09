import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AdminUser } from '@/components/admin/AdminUser';
import { useUnreadCount } from '@/components/admin/inbox/use-inbox';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from '@/components/ui/sidebar';
import { useTRPC } from '@/integrations/trpc/react';

export function AdminSidebar({
	user,
	...props
}: ComponentProps<typeof Sidebar> & {
	user: {
		name: string | null;
		email: string;
	};
}) {
	const trpc = useTRPC();

	// Every room (any status) for the Property menu. Same input as the
	// property management page and the dashboard, so they share one cache entry.
	const { data: roomsData } = useQuery(
		trpc.rooms.adminList.queryOptions({
			limit: 100,
		}),
	);

	const rooms = roomsData?.rooms || [];
	// Cached; refreshed every 5 minutes, on focus and after status changes.
	const unread = useUnreadCount();

	// Navigation data with dynamic room items
	const navMainData = [
		{
			title: 'Dashboard',
			url: '/admin',
			icon: 'tabler:table-dashed',
			items: [
				{
					title: 'Overview',
					url: '/admin',
				},
			],
		},
		{
			title: 'Notifications',
			url: '/admin/inbox',
			icon: 'tabler:bell',
			badge: unread,
			items: [
				{
					title: 'All Notifications',
					url: '/admin/inbox',
				},
			],
		},
		{
			title: 'Bookings',
			url: '/admin/bookings',
			icon: 'tabler:calendar-week',
			items: [
				{
					title: 'Current Bookings',
					url: '/admin/bookings/current-bookings',
				},
				{
					title: 'Past Bookings',
					url: '/admin/bookings/past-bookings',
				},
			],
		},
		{
			title: 'Guests',
			url: '/admin/guest',
			icon: 'tabler:users-group',
			items: [
				{
					title: 'All Guests',
					url: '/admin/guest',
				},
			],
		},
		{
			title: 'Property',
			url: '/admin/property-management',
			icon: 'tabler:home-edit',
			items: [
				...rooms.map((room) => ({
					title: room.name,
					url: `/admin/property-management/${room.publicId}`,
				})),
				{
					title: 'All Rooms',
					url: '/admin/property-management',
				},
			],
		},
		{
			title: 'Policies',
			url: '/admin/cancellation-policy',
			icon: 'tabler:receipt-refund',
			items: [
				{
					title: 'Cancellation & Refunds',
					url: '/admin/cancellation-policy',
				},
			],
		},
	];

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							// oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the link's text is SidebarMenuButton's children
							render={<a href="/admin" />}
						>
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<Icon icon="tabler:layout-dashboard" className="size-5" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-semibold">Irishette</span>
								<span className="truncate text-xs">Admin Panel</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<AdminNavigation items={navMainData} />
			</SidebarContent>
			<SidebarFooter>
				<AdminUser user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
