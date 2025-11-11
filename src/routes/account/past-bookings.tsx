import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	type ColumnFiltersState,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { trpc } from '@/integrations/tanstack-query/root-provider';
import { requireAuth } from '@/utils/auth-check';

// Interface for booking data returned from tRPC
interface BookingData {
	booking: {
		id: string;
		confirmationId: string;
		userId: string;
		roomId: string;
		checkInDate: string;
		checkOutDate: string;
		numberOfNights: number;
		numberOfGuests: number;
		baseAmount: number;
		taxAmount: number | null;
		feesAmount: number | null;
		discountAmount: number | null;
		totalAmount: number;
		status: string;
		paymentStatus: string;
		guestName: string;
		guestEmail: string;
		guestPhone: string | null;
		specialRequests: string | null;
		createdAt: Date;
		updatedAt: Date;
		confirmedAt: Date | null;
		cancelledAt: Date | null;
	};
	room: {
		id: string;
		name: string;
		slug: string;
		basePrice: number;
	};
}

export const Route = createFileRoute('/account/past-bookings')({
	head: () => ({
		meta: [
			{
				title: 'Past Bookings | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check the user is authenticated before rendering the page
		const session = await requireAuth(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	component: PastBookingsPage,
});

function PastBookingsPage() {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: 'booking.checkInDate', desc: true },
	]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState('');

	// Use tRPC query to fetch user's bookings
	const {
		data: allBookings = [],
		isLoading,
		isError,
	} = useQuery(
		trpc.bookings.getMyBookings.queryOptions(
			{
				limit: 50,
				offset: 0,
			},
			{
				retry: false,
				staleTime: 5 * 60 * 1000,
			},
		),
	);

	// Filter to only show past bookings (checkout date is before today)
	const bookings = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

		return allBookings.filter((booking) => {
			const checkOutDate = new Date(`${booking.booking.checkOutDate}T00:00:00`);
			// Include bookings where checkout date is before today AND status is confirmed
			return checkOutDate < today && booking.booking.status === 'confirmed';
		});
	}, [allBookings]);

	// Create columns using the column helper
	const columnHelper = createColumnHelper<BookingData>();

	const columns = useMemo(
		() => [
			columnHelper.accessor('booking.confirmationId', {
				header: 'Confirmation ID',
				cell: (info) => (
					<Link
						to="/account/booking/$bookingId"
						params={{ bookingId: info.row.original.booking.id }}
						className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline"
					>
						{info.getValue()}
					</Link>
				),
			}),
			columnHelper.accessor('booking.checkInDate', {
				id: 'booking.checkInDate',
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
					>
						Stay Dates
						<Icon icon="tabler:arrows-up-down" />
					</Button>
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
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
					>
						Amount
						<Icon icon="tabler:arrows-up-down" />
					</Button>
				),
				cell: (info) => (
					<span className="font-medium">${info.getValue().toFixed(2)}</span>
				),
			}),
		],
		[columnHelper],
	);

	const table = useReactTable({
		data: bookings,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		state: {
			sorting,
			columnFilters,
			globalFilter,
		},
	});

	// Show loading state while fetching bookings
	if (isLoading) {
		return (
			<div className="bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Past Bookings
								</h1>
								<p className="text-muted-foreground">
									Loading your past bookings...
								</p>
							</div>
							<Button asChild variant="outline">
								<Link to="/account">← Back to Account</Link>
							</Button>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<div className="flex items-center justify-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
						<p className="text-muted-foreground ml-2">
							Loading your past bookings...
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Show error state if query failed
	if (isError) {
		return (
			<div className="bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Past Bookings
								</h1>
								<p className="text-muted-foreground">
									Error loading your past bookings
								</p>
							</div>
							<Button asChild variant="outline">
								<Link to="/account">← Back to Account</Link>
							</Button>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<div className="text-center">
						<p className="text-red-600 mb-4">
							There was an error loading your past bookings.
						</p>
						<Button onClick={() => window.location.reload()}>Try Again</Button>
					</div>
				</div>
			</div>
		);
	}

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
											value={globalFilter ?? ''}
											onChange={(event) =>
												setGlobalFilter(String(event.target.value))
											}
											className="pl-8 w-[250px]"
										/>
									</div>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => (
												<TableHead key={header.id}>
													{header.isPlaceholder
														? null
														: flexRender(
																header.column.columnDef.header,
																header.getContext(),
															)}
												</TableHead>
											))}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{table.getRowModel().rows?.length ? (
										table.getRowModel().rows.map((row) => (
											<TableRow
												key={row.id}
												data-state={row.getIsSelected() && 'selected'}
											>
												{row.getVisibleCells().map((cell) => (
													<TableCell key={cell.id}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</TableCell>
												))}
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center"
											>
												No past bookings found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>

							{/* Pagination */}
							{table.getPageCount() > 1 && (
								<div className="flex items-center justify-between space-x-2 py-4">
									<div className="text-sm text-muted-foreground">
										Showing{' '}
										{table.getState().pagination.pageIndex *
											table.getState().pagination.pageSize +
											1}{' '}
										to{' '}
										{Math.min(
											(table.getState().pagination.pageIndex + 1) *
												table.getState().pagination.pageSize,
											table.getFilteredRowModel().rows.length,
										)}{' '}
										of {table.getFilteredRowModel().rows.length} bookings
									</div>
									<div className="space-x-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => table.previousPage()}
											disabled={!table.getCanPreviousPage()}
										>
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => table.nextPage()}
											disabled={!table.getCanNextPage()}
										>
											Next
										</Button>
									</div>
								</div>
							)}
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
