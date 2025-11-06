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
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { trpc } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';
import { requireAdmin } from '@/utils/auth-check';

export const Route = createFileRoute('/admin/guest/$userId')({
	head: () => ({
		meta: [
			{
				title: 'Guest Details | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check user is authenticated and has admin role
		const session = await requireAdmin(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	component: AdminGuestDetail,
});

// Define the booking type
type BookingData = {
	id: string;
	confirmationId: string;
	status: string;
	paymentStatus: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	totalAmount: number;
	guestName: string;
	guestEmail: string;
	guestPhone: string | null;
	createdAt: Date;
	roomId: string;
};

function AdminGuestDetail() {
	const { userId } = Route.useParams();
	const { data: session, isPending } = useSession();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: 'checkInDate', desc: true },
	]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	// Fetch guest details with all bookings
	const {
		data: guestData,
		isLoading,
		error,
	} = useQuery(
		trpc.users.adminGetGuestDetails.queryOptions(
			{
				userId: userId,
			},
			{
				enabled: !isPending && !!session?.user && session.user.role === 'admin',
				retry: false,
				staleTime: 5 * 60 * 1000,
			},
		),
	);

	// Create columns for bookings table
	const columnHelper = createColumnHelper<BookingData>();

	const columns = useMemo(
		() => [
			columnHelper.accessor('confirmationId', {
				header: 'Confirmation ID',
				cell: (info) => (
					<Link
						to="/admin/bookings/$bookingId"
						params={{ bookingId: info.row.original.id }}
						className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline"
					>
						{info.getValue()}
					</Link>
				),
			}),
			columnHelper.accessor('checkInDate', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Check-in
						<Icon icon="tabler:arrows-up-down" />
					</Button>
				),
				cell: (info) => (
					<div>
						<div>
							{new Date(`${info.getValue()}T00:00:00`).toLocaleDateString()}
						</div>
						<div className="text-sm text-muted-foreground">
							to{' '}
							{new Date(
								`${info.row.original.checkOutDate}T00:00:00`,
							).toLocaleDateString()}
						</div>
					</div>
				),
			}),
			columnHelper.accessor('numberOfNights', {
				header: 'Nights',
				cell: (info) =>
					`${info.getValue()} night${info.getValue() !== 1 ? 's' : ''}`,
			}),
			columnHelper.accessor('numberOfGuests', {
				header: 'Guests',
				cell: (info) => info.getValue(),
			}),
			columnHelper.accessor('status', {
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
			columnHelper.accessor('paymentStatus', {
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
			columnHelper.accessor('totalAmount', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
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
		data: guestData?.bookings || [],
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			sorting,
			columnFilters,
		},
		initialState: {
			pagination: {
				pageSize: 10,
			},
		},
	});

	// Calculate statistics
	const stats = useMemo(() => {
		if (!guestData?.bookings) return null;

		const bookings = guestData.bookings;
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

		const totalBookings = bookings.length;

		// A booking is completed if it's confirmed and checkout date is in the past
		const completedBookings = bookings.filter((b) => {
			const checkOutDate = new Date(`${b.checkOutDate}T00:00:00`);
			return b.status === 'confirmed' && checkOutDate < today;
		}).length;

		const cancelledBookings = bookings.filter(
			(b) => b.status === 'cancelled',
		).length;

		const totalSpent = bookings
			.filter((b) => b.paymentStatus === 'paid')
			.reduce((sum, b) => sum + b.totalAmount, 0);

		// Current & Upcoming bookings: confirmed with checkout date today or in the future
		const currentUpcomingBookings = bookings.filter((b) => {
			const checkOutDate = new Date(`${b.checkOutDate}T00:00:00`);
			return b.status === 'confirmed' && checkOutDate >= today;
		}).length;

		return {
			totalBookings,
			completedBookings,
			cancelledBookings,
			totalSpent,
			currentUpcomingBookings,
		};
	}, [guestData]);

	// Loading state
	if (isPending || isLoading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center h-64">
					<div className="text-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
						<p className="text-muted-foreground">Loading guest details...</p>
					</div>
				</div>
			</div>
		);
	}

	// Access denied
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
	if (error || !guestData) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
					<p className="text-muted-foreground mb-4">
						{error instanceof Error
							? error.message
							: 'Failed to load guest details'}
					</p>
					<div className="flex gap-2 justify-center">
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
						>
							Try Again
						</button>
						<Link to="/admin/guest">
							<Button variant="outline">Back to Guests</Button>
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const { user, bookings } = guestData;

	return (
		<AdminLayout title={`Guest: ${user.name}`}>
			<div className="mb-6">
				<Link to="/admin/guest">
					<Button variant="outline" size="sm">
						← Back to Guests
					</Button>
				</Link>
			</div>

			<div className="grid lg:grid-cols-3 gap-6 mb-8">
				{/* Guest Information Card */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Guest Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<p className="text-sm font-medium text-muted-foreground">Name</p>
							<p className="font-semibold">{user.name}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">Email</p>
							<a
								href={`mailto:${user.email}`}
								className="font-semibold text-primary hover:underline"
							>
								{user.email}
							</a>
						</div>
						{(user as { phoneNumber?: string })?.phoneNumber && (
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Phone
								</p>
								<a
									href={`tel:${(user as { phoneNumber?: string })?.phoneNumber}`}
									className="font-semibold text-primary hover:underline"
								>
									{(user as { phoneNumber?: string })?.phoneNumber}
								</a>
							</div>
						)}
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Member Since
							</p>
							<p className="font-semibold">
								{new Date(user.createdAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
						</div>
						{user.stripeCustomerId && (
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Stripe Customer ID
								</p>
								<p className="gap-2 font-mono text-primary break-all">
									<a
										href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
										rel="noopener noreferrer"
										target="_blank"
										className="flex gap-2 hover:underline"
									>
										{user.stripeCustomerId}
										<Icon icon="tabler:external-link" className="size-5" />
									</a>
								</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Statistics Cards */}
				<div className="lg:col-span-2 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Total Bookings</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{stats?.totalBookings}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Current & Upcoming</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-blue-600">
								{stats?.currentUpcomingBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Completed</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-green-600">
								{stats?.completedBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Cancelled</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-red-600">
								{stats?.cancelledBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Total Spent</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								${stats?.totalSpent.toFixed(2)}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Avg. Booking</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								$
								{stats?.totalBookings
									? (stats.totalSpent / stats.totalBookings).toFixed(2)
									: '0.00'}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Bookings History */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Booking History ({bookings.length})
					</CardTitle>
					<CardDescription>All bookings made by this guest</CardDescription>
				</CardHeader>
				<CardContent>
					{bookings.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							No bookings found for this guest.
						</div>
					) : (
						<>
							<ScrollArea className="w-full">
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
												<TableRow key={row.id}>
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
								<ScrollBar orientation="horizontal" />
							</ScrollArea>

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
						</>
					)}
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
