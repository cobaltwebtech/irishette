import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { type ComponentProps, useMemo } from 'react';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AdminUser } from '@/components/admin/AdminUser';
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
import { trpc } from '@/integrations/tanstack-query/root-provider';

export function AdminSidebar({
	user,
	...props
}: ComponentProps<typeof Sidebar> & {
	user: {
		name: string | null;
		email: string;
	};
}) {
	// Fetch rooms for the Property menu
	const { data: roomsData } = useQuery(
		trpc.rooms.list.queryOptions({
			limit: 100,
		}),
	);

	const rooms = roomsData?.rooms || [];

	// Navigation data with dynamic room items
	const navMainData = useMemo(
		() => [
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
						url: `/admin/property-management/${room.id}`,
					})),
					{
						title: 'All Rooms',
						url: '/admin/property-management',
					},
				],
			},
		],
		[rooms],
	);

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<a href="/admin">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<Icon icon="tabler:layout-dashboard" className="size-5" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Irishette</span>
									<span className="truncate text-xs">Admin Panel</span>
								</div>
							</a>
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
