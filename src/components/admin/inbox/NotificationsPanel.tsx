import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';

import {
	formatInboxDate,
	InboxKindLabel,
	InboxSourceBadge,
	UnreadDot,
} from './inbox-ui';

/**
 * The latest notifications about one booking or one guest (admin booking
 * and guest pages). Renders nothing when there are none.
 */
export function NotificationsPanel(
	props: { className?: string } & (
		| { bookingPublicId: string }
		| { userPublicId: string }
	),
) {
	const trpc = useTRPC();
	const byBooking = 'bookingPublicId' in props;
	const { data: bookingItems } = useQuery(
		trpc.inbox.adminListForBooking.queryOptions(
			{ bookingPublicId: byBooking ? props.bookingPublicId : '' },
			{ enabled: byBooking },
		),
	);
	const { data: userItems } = useQuery(
		trpc.inbox.adminListForUser.queryOptions(
			{ userPublicId: byBooking ? '' : props.userPublicId },
			{ enabled: !byBooking },
		),
	);
	const items = (byBooking ? bookingItems : userItems) ?? [];
	if (items.length === 0) return null;

	return (
		<Card className={props.className}>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="divide-y">
					{items.map((item) => (
						<li key={item.publicId}>
							<Link
								to="/admin/inbox/$publicId"
								params={{ publicId: item.publicId }}
								className="flex items-start gap-3 py-3 hover:bg-muted/40"
							>
								<span className="pt-1.5">
									<UnreadDot unread={item.status === 'new'} />
								</span>
								<span className="min-w-0 flex-1 space-y-1">
									<span
										className={
											item.status === 'new'
												? 'block truncate font-semibold'
												: 'block truncate'
										}
									>
										{item.title}
									</span>
									<span className="flex flex-wrap items-center gap-2">
										<InboxSourceBadge source={item.source} />
										<InboxKindLabel kind={item.kind} />
										<span className="text-xs text-muted-foreground">
											{formatInboxDate(item.surfacedAt)}
										</span>
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
