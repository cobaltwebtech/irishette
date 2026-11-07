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

const ADMIN_BOOKINGS_INPUT = { limit: 100, offset: 0 };

const columnHelper = createAppColumnHelper<BookingRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('booking.confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<Link
				to="/admin/bookings/$publicId"
				params={{ publicId: info.row.original.booking.publicId }}
				className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline"
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
				<div className="text-sm text-muted-foreground">
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
	'/_authed/_admin/admin/bookings/current-bookings',
)({
	head: () => ({
		meta: [
			{
				title: 'Current & Upcoming Bookings | Irishette.com',
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
	component: AdminBookings,
});

function AdminBookings() {
	const trpc = useTRPC();

	const { data: bookingsData } = useSuspenseQuery(
		trpc.bookings.adminListBookings.queryOptions(ADMIN_BOOKINGS_INPUT),
	);

	// Current and upcoming confirmed bookings (checkout today or later).
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const bookings = bookingsData.filter((booking) => {
		const checkOutDate = new Date(`${booking.booking.checkOutDate}T00:00:00`);
		return checkOutDate >= today && booking.booking.status === 'confirmed';
	});

	const table = useAppTable({
		data: bookings,
		columns,
		initialState: {
			sorting: [{ id: 'booking.checkInDate', desc: false }],
		},
	});

	return (
		<AdminLayout title="Current & Upcoming Bookings">
			<div className="mb-6">
				<p className="text-muted-foreground">
					Manage and view current and upcoming property bookings
				</p>
			</div>

			<Card className="max-w-full overflow-hidden">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>
							Current Bookings ({table.getFilteredRowModel().rows.length})
						</CardTitle>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Icon
									icon="tabler:search"
									className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4"
								/>
								<Input
									placeholder="Search bookings..."
									value={table.state.globalFilter ?? ''}
									onChange={(event) =>
										table.setGlobalFilter(String(event.target.value))
									}
									className="pl-8 w-[300px]"
								/>
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ScrollArea className="w-full">
						<DataTableView table={table} emptyMessage="No bookings found." />
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
					<PaginationControls table={table} noun="bookings" />
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
