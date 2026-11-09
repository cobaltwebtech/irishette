import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

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

type BookingRow = RouterOutputs['bookings']['adminListBookings'][number];

// Same input as current-bookings, so both share one cache entry.
const ADMIN_BOOKINGS_INPUT = { limit: 100, offset: 0 };

const columnHelper = createAppColumnHelper<BookingRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('booking.confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<Link
				to="/admin/bookings/$publicId"
				params={{ publicId: info.row.original.booking.publicId }}
				className="font-mono text-sm font-semibold text-primary underline hover:text-primary/80"
			>
				{info.getValue()}
			</Link>
		),
	}),
	columnHelper.accessor('booking.checkInDate', {
		id: 'booking.checkInDate',
		header: ({ column }) => (
			<SortableHeader column={column}>Stay Dates</SortableHeader>
		),
		cell: (info) => (
			<div>
				<div>
					{new Date(`${info.getValue()}T00:00:00`).toLocaleDateString()}
				</div>
				<div className="text-sm text-muted-foreground">
					to{' '}
					{new Date(
						`${info.row.original.booking.checkOutDate}T00:00:00`,
					).toLocaleDateString()}
				</div>
			</div>
		),
	}),
	columnHelper.accessor('booking.guestName', {
		header: ({ column }) => (
			<SortableHeader column={column}>Guest</SortableHeader>
		),
		cell: (info) => (
			<div>
				<div className="font-medium">{info.getValue()}</div>
				<div className="text-sm break-all text-muted-foreground">
					{info.row.original.booking.guestEmail}
				</div>
			</div>
		),
	}),
	columnHelper.accessor('room.slug', {
		header: 'Room',
		cell: (info) => (
			<Badge variant="outline" className="capitalize">
				{info.getValue().replace('-', ' ')}
			</Badge>
		),
	}),
	columnHelper.accessor('booking.numberOfGuests', {
		header: 'Guests',
		cell: (info) => info.getValue(),
	}),
	columnHelper.accessor('booking.status', {
		header: 'Status',
		cell: (info) => (
			<Badge
				className="uppercase"
				variant={
					info.getValue() === 'confirmed'
						? 'default'
						: info.getValue() === 'cancelled'
							? 'destructive'
							: info.getValue() === 'completed'
								? 'default'
								: 'secondary'
				}
			>
				{info.getValue()}
			</Badge>
		),
	}),
	columnHelper.accessor('booking.paymentStatus', {
		header: 'Payment',
		cell: (info) => (
			<Badge
				className="uppercase"
				variant={
					info.getValue() === 'paid'
						? 'default'
						: info.getValue() === 'failed'
							? 'destructive'
							: info.getValue() === 'refunded'
								? 'secondary'
								: 'secondary'
				}
			>
				{info.getValue()}
			</Badge>
		),
	}),
	columnHelper.accessor('hasOpenDispute', {
		header: 'Dispute',
		cell: (info) =>
			info.getValue() ? (
				<Badge variant="destructive" className="uppercase">
					Open dispute
				</Badge>
			) : null,
	}),
	columnHelper.accessor('booking.totalAmount', {
		header: ({ column }) => (
			<SortableHeader column={column}>Amount</SortableHeader>
		),
		cell: (info) => (
			<span className="font-medium">${info.getValue().toFixed(2)}</span>
		),
	}),
]);

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/past-bookings',
)({
	head: () => ({
		meta: [
			{
				title: 'Past Bookings | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Bookings are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.bookings.adminListBookings.queryOptions(
				ADMIN_BOOKINGS_INPUT,
			),
		),
	component: PastBookings,
});

function PastBookings() {
	const trpc = useTRPC();

	const { data: bookingsData } = useSuspenseQuery(
		trpc.bookings.adminListBookings.queryOptions(ADMIN_BOOKINGS_INPUT),
	);

	// Past confirmed bookings (checkout date is before today).
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const bookings = bookingsData.filter((booking) => {
		const checkOutDate = new Date(`${booking.booking.checkOutDate}T00:00:00`);
		return checkOutDate < today && booking.booking.status === 'confirmed';
	});

	const table = useAppTable({
		data: bookings,
		columns,
		initialState: {
			// Most recent stays first
			sorting: [{ id: 'booking.checkInDate', desc: true }],
			// Show more records per page for historical view
			pagination: { pageIndex: 0, pageSize: 25 },
		},
	});

	return (
		<AdminLayout title="Past Bookings">
			<div className="mb-6">
				<p className="text-muted-foreground">
					Historical records of completed bookings
				</p>
			</div>

			<Card className="max-w-full overflow-hidden">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>
							Past Bookings ({table.getFilteredRowModel().rows.length})
						</CardTitle>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Icon
									icon="tabler:search"
									className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground"
								/>
								<Input
									placeholder="Search past bookings..."
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
							emptyMessage="No past bookings found."
						/>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
					<PaginationControls table={table} noun="past bookings" />
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
