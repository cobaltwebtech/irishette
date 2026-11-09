import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	formatInboxDate,
	InboxKindLabel,
	InboxSourceBadge,
} from '@/components/admin/inbox/inbox-ui';
import { InboxItemDetails } from '@/components/admin/inbox/InboxItemDetails';
import {
	useDeleteInboxItems,
	useForgetInboxItem,
	useSetInboxStatus,
} from '@/components/admin/inbox/use-inbox';
import { Button, buttonVariants } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { cn } from '@/utils/twMerge';

export const Route = createFileRoute('/_authed/_admin/admin/inbox/$publicId')({
	head: () => ({
		meta: [{ title: 'Notification | Irishette.com' }],
	}),
	// Auth: the _admin layout. The item is preloaded for SSR.
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.inbox.adminGet.queryOptions({
					publicId: params.publicId,
				}),
			),
		),
	notFoundComponent: NotificationNotFound,
	component: NotificationPage,
});

function BackToList() {
	return (
		<Link
			to="/admin/inbox"
			data-slot="button"
			className={cn(buttonVariants({ variant: 'outline' }))}
		>
			<Icon icon="tabler:arrow-left" className="size-4" />
			All notifications
		</Link>
	);
}

function NotificationNotFound() {
	return (
		<AdminLayout title="Notification Not Found">
			<Card>
				<CardContent className="space-y-4 pt-6">
					<p className="text-muted-foreground">
						This notification does not exist or was deleted.
					</p>
					<BackToList />
				</CardContent>
			</Card>
		</AdminLayout>
	);
}

function NotificationPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();
	const navigate = useNavigate();
	const { data: item } = useSuspenseQuery(
		trpc.inbox.adminGet.queryOptions({ publicId }),
	);
	const setStatus = useSetInboxStatus();
	const remove = useDeleteInboxItems();
	const forgetItem = useForgetInboxItem();
	const [confirmDelete, setConfirmDelete] = useState(false);

	// Opening an unread item marks it read (once per item).
	const markedRead = useRef<string | null>(null);
	const { mutate } = setStatus;
	useEffect(() => {
		if (item.status !== 'new' || markedRead.current === item.publicId) return;
		markedRead.current = item.publicId;
		mutate({ publicIds: [item.publicId], status: 'read' });
	}, [item.publicId, item.status, mutate]);

	const archived = item.status === 'archived';

	return (
		<AdminLayout title="Notification">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<BackToList />
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setStatus.mutate({ publicIds: [publicId], status: 'new' })
						}
					>
						<Icon icon="tabler:mail" className="size-4" />
						Mark unread
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setStatus.mutate({
								publicIds: [publicId],
								status: archived ? 'unarchived' : 'archived',
							})
						}
					>
						<Icon
							icon={archived ? 'tabler:inbox' : 'tabler:archive'}
							className="size-4"
						/>
						{archived ? 'Move to inbox' : 'Archive'}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setConfirmDelete(true)}
					>
						<Icon icon="tabler:trash" className="size-4" />
						Delete
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<InboxSourceBadge source={item.source} />
							<InboxKindLabel kind={item.kind} />
							{archived && (
								<span className="text-xs text-muted-foreground">Archived</span>
							)}
						</div>
						<CardTitle className="text-xl">{item.title}</CardTitle>
						<CardDescription>
							{formatInboxDate(item.createdAt)}
							{item.occurrences > 1 &&
								` · reported ${item.occurrences} times, last ${formatInboxDate(item.surfacedAt)}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<InboxItemDetails item={item} />
					</CardContent>
				</Card>

				<LinkedTo booking={item.booking} guest={item.guest} />
			</div>

			<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete this notification?</DialogTitle>
						<DialogDescription>
							This cannot be undone. Bookings and payments are not affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmDelete(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								remove.mutate(
									{ publicIds: [publicId] },
									{
										onSuccess: async () => {
											await navigate({ to: '/admin/inbox' });
											forgetItem(publicId);
										},
									},
								)
							}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</AdminLayout>
	);
}

type Item = RouterOutputs['inbox']['adminGet'];

/** The booking and guest a notification is linked to (if any). */
function LinkedTo({
	booking,
	guest,
}: {
	booking: Item['booking'];
	guest: Item['guest'];
}) {
	if (!booking && !guest) return null;
	return (
		<Card className="h-fit">
			<CardHeader>
				<CardTitle className="text-base">Linked to</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4 text-sm">
				{booking && (
					<div className="space-y-1">
						<div className="text-muted-foreground">Booking</div>
						<Link
							to="/admin/bookings/$publicId"
							params={{ publicId: booking.publicId }}
							className="font-mono font-medium text-primary hover:underline"
						>
							{booking.confirmationId}
						</Link>
						<div>
							{booking.guestName}, {booking.checkInDate} to{' '}
							{booking.checkOutDate} ({booking.status})
						</div>
					</div>
				)}
				{guest && (
					<div className="space-y-1">
						<div className="text-muted-foreground">Guest</div>
						<Link
							to="/admin/guest/$publicId"
							params={{ publicId: guest.publicId }}
							className="font-medium text-primary hover:underline"
						>
							{guest.name}
						</Link>
						<div>{guest.email}</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
