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
import { ArrowLeft, ArrowUpDown, Edit, Home, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

export const Route = createFileRoute('/admin/property-management/')({
	head: () => ({
		meta: [
			{
				title: 'Property Management | Irishette.com',
			},
		],
	}),
	component: PropertyManagement,
});

// Types for room management
type RoomStatus = 'active' | 'inactive' | 'archived';

type Room = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	basePrice: number;
	status: RoomStatus;
	isActive: boolean | null; // Keep for backward compatibility
	airbnbIcalUrl: string | null;
	expediaIcalUrl: string | null;
	lastAirbnbSync: Date | null;
	lastExpediaSync: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

// Form types
type RoomFormData = {
	name: string;
	slug: string;
	description: string;
	basePrice: number;
	status: RoomStatus;
	isActive: boolean; // Keep for backward compatibility
};

type EditMode = 'none' | 'add';

function PropertyManagement() {
	const { data: session } = useSession();
	const roomNameId = useId();
	const roomSlugId = useId();
	const roomDescriptionId = useId();
	const basePriceId = useId();
	const [rooms, setRooms] = useState<Room[]>([]);
	const [loading, setLoading] = useState(true);
	const [editMode, setEditMode] = useState<EditMode>('none');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [formData, setFormData] = useState<RoomFormData>({
		name: '',
		slug: '',
		description: '',
		basePrice: 0,
		status: 'active',
		isActive: true,
	});

	// Load rooms function
	const loadRooms = useCallback(async () => {
		try {
			setLoading(true);
			const inputParam = encodeURIComponent(JSON.stringify({ limit: 100 }));
			const response = await fetch(`/api/trpc/rooms.list?input=${inputParam}`, {
				method: 'GET',
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('API Error:', errorText);
				throw new Error('Failed to fetch rooms');
			}

			const data = (await response.json()) as {
				result: { data: { rooms: Room[] } };
			};
			setRooms(data.result.data.rooms || []);
		} catch (error) {
			console.error('Failed to load rooms:', error);
		} finally {
			setLoading(false);
		}
	}, []);

	// Load rooms on component mount
	useEffect(() => {
		loadRooms();
	}, [loadRooms]);

	// Room CRUD operations
	const handleAddRoom = () => {
		setEditMode('add');
		setFormData({
			name: '',
			slug: '',
			description: '',
			basePrice: 0,
			status: 'active',
			isActive: true,
		});
	};

	const handleSaveRoom = async () => {
		try {
			// Create new room
			const response = await fetch('/api/trpc/rooms.create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Create room error:', errorText);
				throw new Error('Failed to add room');
			}

			await loadRooms();
			setEditMode('none');
		} catch (error) {
			console.error('Failed to add room:', error);
		}
	};

	const handleCancelEdit = () => {
		setEditMode('none');
	};

	// Auto-generate slug from name
	const generateSlug = (name: string) => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	};

	const handleNameChange = (name: string) => {
		setFormData((prev) => ({
			...prev,
			name,
			slug: generateSlug(name),
		}));
	};

	// Create columns using the column helper
	const columnHelper = createColumnHelper<Room>();

	const columns = useMemo(
		() => [
			columnHelper.accessor('name', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2 font-medium"
					>
						Room Name
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<div>
						<div className="font-medium">{info.getValue()}</div>
						<div className="text-sm text-muted-foreground">
							/{info.row.original.slug}
						</div>
						{info.row.original.description && (
							<div className="text-sm text-muted-foreground mt-1">
								{info.row.original.description}
							</div>
						)}
					</div>
				),
			}),
			columnHelper.accessor('status', {
				header: 'Status',
				cell: (info) => (
					<Badge
						className="capitalize"
						variant={
							info.getValue() === 'active'
								? 'default'
								: info.getValue() === 'inactive'
									? 'secondary'
									: 'destructive'
						}
					>
						{info.getValue()}
					</Badge>
				),
			}),
			columnHelper.accessor('basePrice', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2 font-medium"
					>
						Base Price
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<span className="font-medium">${info.getValue().toFixed(2)}</span>
				),
			}),
			columnHelper.accessor('updatedAt', {
				header: ({ column }) => (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
						className="h-8 px-2 font-medium hidden sm:flex"
					>
						Last Updated
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: (info) => (
					<span className="text-sm hidden sm:inline">
						{new Date(info.getValue()).toLocaleDateString()}
					</span>
				),
			}),
			columnHelper.display({
				id: 'actions',
				header: 'Actions',
				size: 100,
				cell: (info) => (
					<Link
						to="/admin/property-management/$roomId"
						params={{ roomId: info.row.original.id }}
					>
						<Button
							variant="outline"
							size="sm"
							className="flex items-center gap-1 whitespace-nowrap"
						>
							<Edit className="h-4 w-4" />
							Edit
						</Button>
					</Link>
				),
			}),
		],
		[columnHelper],
	);

	const table = useReactTable({
		data: rooms,
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

	if (!session) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-4">Access Denied</h1>
					<p className="mb-4">You must be logged in to access this page.</p>
					<Link to="/login" className="text-blue-600 hover:underline">
						Go to Login
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-6">
				<Link
					to="/admin"
					className="inline-flex items-center text-blue-600 hover:underline mb-4"
				>
					<ArrowLeft className="h-4 w-4 mr-2" />
					Back to Admin
				</Link>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold flex items-center gap-2">
							<Home className="h-8 w-8" />
							Property Management
						</h1>
						<p className="text-gray-600 mt-2">
							Manage your rooms and properties
						</p>
					</div>
					<Button onClick={handleAddRoom} className="flex items-center gap-2">
						<Plus className="h-4 w-4" />
						Add Room
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="text-center py-8">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
					<p className="mt-2 text-gray-600">Loading rooms...</p>
				</div>
			) : (
				<>
					{/* Add Room Form */}
					{editMode === 'add' && (
						<Card className="mb-6">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Plus className="h-5 w-5" />
									Add New Room
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div>
									<label
										htmlFor={roomNameId}
										className="block text-sm font-medium mb-1"
									>
										Room Name
									</label>
									<Input
										id={roomNameId}
										value={formData.name}
										onChange={(e) => handleNameChange(e.target.value)}
										placeholder="e.g., Rose Room"
									/>
								</div>
								<div>
									<label
										htmlFor={roomSlugId}
										className="block text-sm font-medium mb-1"
									>
										Slug
									</label>
									<Input
										id={roomSlugId}
										value={formData.slug}
										onChange={(e) =>
											setFormData((prev) => ({ ...prev, slug: e.target.value }))
										}
										placeholder="e.g., rose-room"
									/>
								</div>
								<div>
									<label
										htmlFor={roomDescriptionId}
										className="block text-sm font-medium mb-1"
									>
										Description
									</label>
									<Input
										id={roomDescriptionId}
										value={formData.description}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												description: e.target.value,
											}))
										}
										placeholder="Room description (optional)"
									/>
								</div>
								<div>
									<label
										htmlFor={basePriceId}
										className="block text-sm font-medium mb-1"
									>
										Base Price ($)
									</label>
									<Input
										id={basePriceId}
										type="number"
										step="0.01"
										min="0"
										value={formData.basePrice}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												basePrice: parseFloat(e.target.value) || 0,
											}))
										}
										placeholder="0.00"
									/>
								</div>
								<div className="flex items-center gap-2">
									<div className="text-sm font-medium">Change Room Status:</div>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" className="capitalize">
												{formData.status}
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent>
											<DropdownMenuItem
												onClick={() =>
													setFormData((prev) => ({
														...prev,
														status: 'active',
														isActive: true,
													}))
												}
											>
												Active
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() =>
													setFormData((prev) => ({
														...prev,
														status: 'inactive',
														isActive: false,
													}))
												}
											>
												Inactive
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
								<div className="flex gap-2">
									<Button onClick={handleSaveRoom}>Add Room</Button>
									<Button variant="outline" onClick={handleCancelEdit}>
										Cancel
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Rooms List */}
					{rooms.length === 0 ? (
						<Card>
							<CardContent className="text-center py-8">
								<Home className="h-12 w-12 mx-auto text-gray-400 mb-4" />
								<h3 className="text-lg font-medium text-gray-900 mb-2">
									No rooms found
								</h3>
								<p className="text-gray-500 mb-4">
									Get started by adding your first room.
								</p>
								<Button
									onClick={handleAddRoom}
									className="flex items-center gap-2"
								>
									<Plus className="h-4 w-4" />
									Add Your First Room
								</Button>
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between flex-col sm:flex-row gap-4">
									<CardTitle>
										Rooms ({table.getFilteredRowModel().rows.length})
									</CardTitle>
									<div className="flex items-center gap-2 w-full sm:w-auto">
										<div className="relative w-full sm:w-[300px]">
											<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
											<Input
												placeholder="Search rooms..."
												value={globalFilter ?? ''}
												onChange={(event) =>
													setGlobalFilter(String(event.target.value))
												}
												className="pl-8"
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
													<TableHead
														key={header.id}
														className={
															header.id === 'updatedAt'
																? 'hidden sm:table-cell'
																: ''
														}
													>
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
														<TableCell
															key={cell.id}
															className={
																cell.column.id === 'updatedAt'
																	? 'hidden sm:table-cell'
																	: ''
															}
														>
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
													No results.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>

								{/* Pagination */}
								<div className="flex items-center justify-between space-x-2 py-4 flex-col sm:flex-row gap-4">
									<div className="text-sm text-muted-foreground order-2 sm:order-1">
										Showing {table.getFilteredRowModel().rows.length} room(s)
									</div>
									<div className="space-x-2 order-1 sm:order-2">
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
					)}
				</>
			)}
		</div>
	);
}
