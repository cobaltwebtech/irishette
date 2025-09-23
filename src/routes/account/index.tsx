import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
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
import { ArrowUpDown, LogOut, Search, Settings, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { client, useSession } from '@/lib/auth-client';

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
		internalNotes: string | null;
		stripeCustomerId: string | null;
		stripeSessionId: string | null;
		stripePaymentIntentId: string | null;
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

export const Route = createFileRoute('/account/')({
	head: () => ({
		meta: [
			{
				title: 'My Account | Irishette.com',
			},
		],
	}),
	component: AccountPage,
});

function AccountPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const routeContext = Route.useRouteContext();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: 'booking.checkInDate', desc: false }, // Default sort by check-in date (ascending)
	]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState('');

	// Redirect if not logged in
	useEffect(() => {
		if (!isPending && !session) {
			router.navigate({ to: '/login' });
		}
	}, [session, isPending, router]);

	// Use tRPC query to fetch user's bookings
	const {
		data: allBookings = [],
		isLoading,
		isError,
	} = useQuery({
		...routeContext.trpc.bookings.getMyBookings.queryOptions({
			userId: session?.user?.id || '',
			limit: 10,
			offset: 0,
		}),
		enabled: !isPending && !!session?.user?.id, // Cookie caching should handle SSR now
		retry: false, // Avoid retries during SSR issues
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	// Filter to only show confirmed bookings (exclude pending/incomplete bookings)
	const bookings = useMemo(() => {
		return allBookings.filter(
			(booking) => booking.booking.status === 'confirmed',
		);
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
			columnHelper.accessor('room.name', {
				header: 'Room',
				cell: (info) => (
					<Badge variant="outline" className="capitalize">
						{info.getValue()}
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
						Check-in Date
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<div>
						<div className="font-medium">
							{new Date(info.getValue() + 'T00:00:00').toLocaleDateString()}
						</div>
						<div className="text-sm text-muted-foreground">
							to{' '}
							{new Date(
								info.row.original.booking.checkOutDate + 'T00:00:00',
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

	const handleSignOut = async () => {
		try {
			await client.signOut();
			router.navigate({ to: '/' });
		} catch (error) {
			console.error('Sign out error:', error);
		}
	};

	if (isPending) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading your dashboard...</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return null; // Will redirect via useEffect
	}

	// Show loading state while fetching bookings
	if (isLoading) {
		return (
			<div className="min-h-screen bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Welcome back, {session.user.name || session.user.email}
								</h1>
								<p className="text-muted-foreground">
									Loading your bookings...
								</p>
							</div>
							<Button variant="outline" onClick={handleSignOut}>
								<LogOut className="w-4 h-4 mr-2" />
								Sign Out
							</Button>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<div className="flex items-center justify-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
						<p className="text-muted-foreground ml-2">
							Loading your bookings...
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Show error state if query failed
	if (isError) {
		return (
			<div className="min-h-screen bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Welcome back, {session.user.name || session.user.email}
								</h1>
								<p className="text-muted-foreground">
									Error loading your bookings
								</p>
							</div>
							<Button variant="outline" onClick={handleSignOut}>
								<LogOut className="w-4 h-4 mr-2" />
								Sign Out
							</Button>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<div className="text-center">
						<p className="text-red-600 mb-4">
							There was an error loading your bookings.
						</p>
						<Button onClick={() => window.location.reload()}>Try Again</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Welcome back, {session.user.name || session.user.email}
							</h1>
							<p className="text-muted-foreground">
								Manage your bookings and account settings
							</p>
						</div>
						<Button variant="outline" onClick={handleSignOut}>
							<LogOut className="w-4 h-4 mr-2" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				{/* Bookings Table */}
				{bookings.length > 0 && (
					<Card className="mb-8">
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>
										My Bookings ({table.getFilteredRowModel().rows.length})
									</CardTitle>
									<CardDescription>
										Your confirmed bookings. Click on the confirmation ID to
										view more details.
									</CardDescription>
								</div>
								<div className="flex items-center gap-2">
									<div className="relative">
										<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
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
												No bookings found.
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
				)}

				<div className="grid gap-6 md:grid-cols-2">
					{/* Account Info Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<User className="w-5 h-5 mr-2" />
								Account Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Email
									</p>
									<p className="text-foreground">{session.user.email}</p>
								</div>
								{session.user.name && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Name
										</p>
										<p className="text-foreground">{session.user.name}</p>
									</div>
								)}
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Member Since
									</p>
									<p className="text-foreground">
										{new Date(session.user.createdAt).toLocaleDateString()}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Quick Actions Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Settings className="w-5 h-5 mr-2" />
								Quick Actions
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<p>Update Profile</p>
								<Button>Edit your information</Button>
							</div>
							<div>
								<p>Have questions or need assistance?</p>
								<Button variant="secondary">Contact Us</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
