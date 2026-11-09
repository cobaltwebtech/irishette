import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/twMerge';

export function AdminNavigation({
	items,
}: {
	items: {
		title: string;
		url: string;
		icon?: string;
		isActive?: boolean;
		/** Count shown next to the title (e.g. unread notifications); 0 hides it. */
		badge?: number;
		items?: {
			title: string;
			url: string;
		}[];
	}[];
}) {
	return (
		<SidebarGroup>
			<SidebarMenu>
				{items.map((item) => (
					<Collapsible
						key={item.title}
						defaultOpen={true}
						className="group/collapsible"
						render={<SidebarMenuItem />}
					>
						<CollapsibleTrigger
							render={<SidebarMenuButton tooltip={item.title} />}
						>
							{item.icon && <Icon icon={item.icon} className="size-5" />}
							<span>{item.title}</span>
							{item.badge ? (
								<span
									className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
									aria-label={`${item.badge} unread`}
								>
									{item.badge > 99 ? '99+' : item.badge}
								</span>
							) : null}
							<Icon
								icon="tabler:chevron-right"
								className={cn(
									'transition-transform duration-200 group-data-open/collapsible:rotate-90',
									!item.badge && 'ml-auto',
								)}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<SidebarMenuSub>
								{item.items?.map((subItem) => (
									<SidebarMenuSubItem key={subItem.title}>
										<SidebarMenuSubButton asChild>
											<Link to={subItem.url}>
												<span>{subItem.title}</span>
											</Link>
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
								))}
							</SidebarMenuSub>
						</CollapsibleContent>
					</Collapsible>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
