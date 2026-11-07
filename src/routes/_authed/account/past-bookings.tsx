import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	createAppColumnHelper,
	DataTableView,
	PaginationControls,
	SortableHeader,
	useAppTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';

type BookingRow = RouterOutputs['bookings']['getMyBookings'][number];

// Same input as the account page, so both share one cache entry.
const MY_BOOKINGS_INPUT = { limit: 50, offset: 0 };

const columnHelper = createAppColumnHelper<BookingRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('booking.confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<Link
				to="/account/booking/$publicId"
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
				<div className="font-medium">
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
	columnHelper.accessor('room.name', {
		header: 'Room',
		cell: (info) => (
			<Badge variant="outline" className="capitalize">
				{info.getValue()}
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
				variant={
					info.getValue() === 'confirmed'
						? 'default'
						: info.getValue() === 'cancelled'
							? 'destructive'
							: info.getValue() === 'completed'
								? 'default'
								: 'secondary'
				}
				className="capitalize"
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

export const Route = createFileRoute('/_authed/account/past-bookings')({
	head: () => ({
		meta: [
			{
				title: 'Past Bookings | Irishette.com',
			},
		],
	}),
	// Auth: the _authed layout. Bookings are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
		),
	component: PastBookingsPage,
});

function PastBookingsPage() {
	const trpc = useTRPC();

	const { data: allBookings } = useSuspenseQuery(
		trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
	);

	// Past confirmed bookings (checkout date is before today).
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const bookings = allBookings.filter((booking) => {
		const checkOutDate = new Date(`${booking.booking.checkOutDate}T00:00:00`);
		return checkOutDate < today && booking.booking.status === 'confirmed';
	});

	const table = useAppTable({
		data: bookings,
		columns,
		initialState: {
			sorting: [{ id: 'booking.checkInDate', desc: true }],
		},
	});

	return (
		<div className="bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Past Bookings
							</h1>
							<p className="text-muted-foreground">
								View your previous booking history
							</p>
						</div>
						<Button asChild variant="outline">
							<Link to="/account">← Back to Account</Link>
						</Button>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				{/* Conditional Rendering: Show table if bookings exist, otherwise show empty state */}
				{bookings.length > 0 ? (
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>
										Past Bookings ({table.getFilteredRowModel().rows.length})
									</CardTitle>
									<CardDescription>
										Your previous confirmed bookings. Click on the confirmation
										ID to view more details.
									</CardDescription>
								</div>
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
											className="pl-8 w-[250px]"
										/>
									</div>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<DataTableView
								table={table}
								emptyMessage="No past bookings found."
							/>
							<PaginationControls table={table} noun="bookings" />
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Icon
								icon="tabler:calendar-check"
								className="size-16 text-muted-foreground mb-4"
							/>
							<h3 className="text-xl font-semibold mb-2">No Past Bookings</h3>
							<p className="text-muted-foreground text-center mb-6 max-w-md">
								You don't have any past bookings yet. Once your stay is
								complete, it will appear here.
							</p>
							<Button asChild>
								<Link to="/account">← Back to Account</Link>
							</Button>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
