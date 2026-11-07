import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	createAppColumnHelper,
	DataTableView,
	PaginationControls,
	SortableHeader,
	useAppTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';

type GuestRow = RouterOutputs['users']['adminListGuests']['guests'][number];

const GUESTS_INPUT = { limit: 100, offset: 0 };

const columnHelper = createAppColumnHelper<GuestRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('user.name', {
		header: ({ column }) => (
			<SortableHeader column={column}>Guest Name</SortableHeader>
		),
		cell: (info) => (
			<div className="flex items-center gap-2">
				<Icon
					icon="tabler:user-circle"
					className="size-5 text-muted-foreground"
				/>
				<div>
					<div className="font-medium">{info.getValue()}</div>
					<div className="text-xs text-muted-foreground">
						Member since{' '}
						{new Date(info.row.original.user.createdAt).toLocaleDateString()}
					</div>
				</div>
			</div>
		),
	}),
	columnHelper.accessor('user.email', {
		header: ({ column }) => (
			<SortableHeader column={column}>Email</SortableHeader>
		),
		cell: (info) => (
			<a
				href={`mailto:${info.getValue()}`}
				className="text-primary hover:underline"
			>
				{info.getValue()}
			</a>
		),
	}),
	columnHelper.accessor('user.phoneNumber', {
		header: 'Phone',
		cell: (info) => {
			const phone = info.getValue();
			return phone ? (
				<a href={`tel:${phone}`} className="text-primary hover:underline">
					{phone}
				</a>
			) : (
				<span className="text-muted-foreground">N/A</span>
			);
		},
	}),
	columnHelper.accessor('bookingCount', {
		header: ({ column }) => (
			<SortableHeader column={column}>Bookings</SortableHeader>
		),
		cell: (info) => {
			const count = info.getValue();
			return (
				<div className="flex items-center gap-2">
					<Badge variant={count > 0 ? 'default' : 'secondary'}>{count}</Badge>
					{count > 1 && (
						<Badge variant="outline" className="text-xs">
							<Icon icon="tabler:star" className="size-4 text-accent" />
							Repeat Guest
						</Badge>
					)}
				</div>
			);
		},
	}),
]);

export const Route = createFileRoute('/_authed/_admin/admin/guest/')({
	head: () => ({
		meta: [
			{
				title: 'Guest Management | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Guests are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.users.adminListGuests.queryOptions(GUESTS_INPUT),
		),
	component: AdminGuests,
});

function AdminGuests() {
	const navigate = useNavigate();
	const trpc = useTRPC();

	const { data: guestsResponse } = useSuspenseQuery(
		trpc.users.adminListGuests.queryOptions(GUESTS_INPUT),
	);

	const table = useAppTable({
		data: guestsResponse.guests,
		columns,
	});

	return (
		<AdminLayout title="Guest Management">
			<div className="mb-6">
				<p className="text-muted-foreground">
					View and manage all registered guests and their booking history
				</p>
			</div>

			<Card className="max-w-full overflow-hidden">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>
							All Guests ({table.getFilteredRowModel().rows.length})
						</CardTitle>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Icon
									icon="tabler:search"
									className="absolute top-1/2 left-2 size-5 -translate-y-1/2 transform text-muted-foreground"
								/>
								<Input
									placeholder="Search guests..."
									value={table.state.globalFilter ?? ''}
									onChange={(event) =>
										table.setGlobalFilter(String(event.target.value))
									}
									className="w-[300px] pl-8"
								/>
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ScrollArea className="w-full">
						<DataTableView
							table={table}
							emptyMessage="No guests found."
							onRowClick={(guest) =>
								navigate({
									to: '/admin/guest/$publicId',
									params: { publicId: guest.user.publicId },
								})
							}
						/>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
					<PaginationControls table={table} noun="guests" />
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
