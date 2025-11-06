import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export const Route = createFileRoute('/admin/guest/')({
	head: () => ({
		meta: [
			{
				title: 'Guest Management | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check user is authenticated and has admin role
		const session = await requireAdmin(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	component: AdminGuests,
});

// Define the guest type based on the tRPC response structure
type GuestData = {
	user: {
		id: string;
		name: string;
		email: string;
		createdAt: Date;
		stripeCustomerId: string | null;
		phoneNumber: string | null;
	};
	bookingCount: number;
};

function AdminGuests() {
	const { data: session, isPending } = useSession();
	const navigate = useNavigate();
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState('');

	// Use tRPC query to fetch guests
	const {
		data: guestsResponse,
		isLoading,
		error,
	} = useQuery(
		trpc.users.adminListGuests.queryOptions(
			{
				limit: 100,
				offset: 0,
			},
			{
				enabled: !isPending && !!session?.user && session.user.role === 'admin',
				retry: false,
				staleTime: 5 * 60 * 1000, // 5 minutes
			},
		),
	);

	const guests = useMemo(() => {
		return guestsResponse?.guests || [];
	}, [guestsResponse]);

	// Create columns using the column helper
	const columnHelper = createColumnHelper<GuestData>();

	const columns = useMemo(
		() => [
			columnHelper.accessor('user.name', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Guest Name
						<Icon icon="tabler:arrows-up-down" />
					</Button>
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
								{new Date(
									info.row.original.user.createdAt,
								).toLocaleDateString()}
							</div>
						</div>
					</div>
				),
			}),
			columnHelper.accessor('user.email', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Email
						<Icon icon="tabler:arrows-up-down" />
					</Button>
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
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2"
					>
						Bookings
						<Icon icon="tabler:arrows-up-down" />
					</Button>
				),
				cell: (info) => {
					const count = info.getValue();
					return (
						<div className="flex items-center gap-2">
							<Badge variant={count > 0 ? 'default' : 'secondary'}>
								{count}
							</Badge>
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
		],
		[columnHelper],
	);

	const table = useReactTable({
		data: guests,
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
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
						<p className="text-muted-foreground">Loading guests...</p>
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
					<p className="text-muted-foreground mb-4">
						{error instanceof Error ? error.message : 'Failed to load guests'}
					</p>
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
									className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground size-5"
								/>
								<Input
									placeholder="Search guests..."
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
										<TableRow
											key={row.id}
											data-state={row.getIsSelected() && 'selected'}
											onClick={() =>
												navigate({
													to: '/admin/guest/$userId',
													params: { userId: row.original.user.id },
												})
											}
											className="cursor-pointer hover:bg-muted/50"
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
											No guests found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>

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
							of {table.getFilteredRowModel().rows.length} guests
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
		</AdminLayout>
	);
}
