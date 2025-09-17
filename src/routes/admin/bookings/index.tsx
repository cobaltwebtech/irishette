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
import { ArrowLeft, ArrowUpDown, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/admin/bookings/')({
	component: AdminBookings,
});

// Define the booking type based on the tRPC response structure
type BookingData = {
	booking: {
		id: string;
		confirmationId: string;
		status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
		paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
		guestName: string;
		guestEmail: string;
		checkInDate: string;
		checkOutDate: string;
		totalAmount: number;
		numberOfGuests: number;
		createdAt: string;
		roomId: string;
	};
	room: {
		id: string;
		slug: string;
		basePrice: number;
	};
	user: {
		id: string;
		email: string;
		name?: string;
	};
};

function AdminBookings() {
	const { data: session, isPending } = useSession();
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [bookings, setBookings] = useState<BookingData[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch bookings data
	useEffect(() => {
		const fetchBookings = async () => {
			if (!session?.user || session.user.role !== 'admin') return;

			try {
				setIsLoading(true);
				setError(null);

				console.log('Fetching admin bookings...');

				const response = await fetch('/api/trpc/bookings.adminListBookings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						limit: 100, // Get all bookings for now
						offset: 0,
					}),
				});

				console.log('Response status:', response.status);

				if (!response.ok) {
					const errorText = await response.text();
					console.error('Response error:', errorText);
					throw new Error('Failed to fetch bookings');
				}

				const result = (await response.json()) as {
					result?: {
						data?: BookingData[];
					};
				};

				console.log('Received result:', result);

				const bookingsData = result.result?.data;

				if (!bookingsData) {
					throw new Error('No booking data found in response');
				}

				// Filter out pending bookings since they are temporary and payment is not completed
				const filteredBookings = bookingsData.filter(
					(booking) => booking.booking.status !== 'pending',
				);

				setBookings(filteredBookings);
			} catch (error) {
				console.error('Failed to fetch bookings:', error);
				setError(
					error instanceof Error ? error.message : 'Failed to load bookings',
				);
			} finally {
				setIsLoading(false);
			}
		};

		if (session?.user?.role === 'admin') {
			fetchBookings();
		} else if (!isPending) {
			setIsLoading(false);
		}
	}, [session?.user, isPending]);

	// Create columns using the column helper
	const columnHelper = createColumnHelper<BookingData>();

	const columns = useMemo(
		() => [
			columnHelper.accessor('booking.confirmationId', {
				header: 'Confirmation ID',
				cell: (info) => (
					<Link
						to="/admin/bookings/$bookingId"
						params={{ bookingId: info.row.original.booking.id }}
						className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline"
					>
						{info.getValue()}
					</Link>
				),
			}),
			columnHelper.accessor('booking.guestName', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Guest
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
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
			columnHelper.accessor('booking.checkInDate', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Check-in
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<div>
						<div>{new Date(info.getValue()).toLocaleDateString()}</div>
						<div className="text-sm text-muted-foreground">
							to{' '}
							{new Date(
								info.row.original.booking.checkOutDate,
							).toLocaleDateString()}
						</div>
					</div>
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
					>
						{info.getValue()}
					</Badge>
				),
			}),
			columnHelper.accessor('booking.paymentStatus', {
				header: 'Payment',
				cell: (info) => (
					<Badge
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
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Amount
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<span className="font-medium">${info.getValue().toFixed(2)}</span>
				),
			}),
			columnHelper.accessor('booking.createdAt', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Created
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<span className="text-sm">
						{new Date(info.getValue()).toLocaleDateString()}
					</span>
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

	// Early return for loading state
	if (isPending || isLoading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center h-64">
					<div className="text-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
						<p className="text-muted-foreground">Loading bookings...</p>
					</div>
				</div>
			</div>
		);
	}

	// Access denied check
	if (!session?.user || session.user.role !== 'admin') {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h2 className="text-2xl font-bold mb-4">Access Denied</h2>
					<p className="text-muted-foreground">
						You don't have permission to view this page.
					</p>
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
					<p className="text-muted-foreground mb-4">{error}</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
					>
						Try Again
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			{/* Header */}
			<div className="mb-8">
				<div className="flex items-center gap-4 mb-4">
					<Link
						to="/admin"
						className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Dashboard
					</Link>
				</div>
				<h1 className="text-3xl font-bold">All Bookings</h1>
				<p className="text-muted-foreground">
					Manage and view all property bookings
				</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>
							Bookings ({table.getFilteredRowModel().rows.length})
						</CardTitle>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
								<Input
									placeholder="Search bookings..."
									value={globalFilter ?? ''}
									onChange={(event) =>
										setGlobalFilter(String(event.target.value))
									}
									className="pl-8 w-[300px]"
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
										No bookings found.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>

					{/* Pagination */}
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
				</CardContent>
			</Card>
		</div>
	);
}
