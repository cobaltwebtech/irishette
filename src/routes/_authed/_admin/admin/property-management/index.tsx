import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FlexRender } from '@tanstack/react-table';
import { useId, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	createAppColumnHelper,
	type DataTable,
	SortableHeader,
	useAppTable,
} from '@/components/data-table';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';

// Same input as the admin sidebar, so both share one cache entry.
const ROOMS_INPUT = { limit: 100 };

export const Route = createFileRoute(
	'/_authed/_admin/admin/property-management/',
)({
	head: () => ({
		meta: [
			{
				title: 'Property Management | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Rooms are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.rooms.adminList.queryOptions(ROOMS_INPUT),
		),
	component: PropertyManagement,
});

// Types for room management
type RoomStatus = 'active' | 'inactive' | 'archived';

type RoomRow = RouterOutputs['rooms']['adminList']['rooms'][number];

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

const columnHelper = createAppColumnHelper<RoomRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('name', {
		header: ({ column }) => (
			<SortableHeader column={column}>Room Name</SortableHeader>
		),
		cell: (info) => (
			<div>
				<div className="font-medium">{info.getValue()}</div>
				{info.row.original.description && (
					<div className="mt-1 text-sm text-muted-foreground">
						{info.row.original.description}
					</div>
				)}
			</div>
		),
	}),
	columnHelper.display({
		id: 'actions',
		header: 'Actions',
		cell: (info) => (
			<Link
				to="/admin/property-management/$publicId"
				params={{ publicId: info.row.original.publicId }}
			>
				<Button
					variant="outline"
					size="sm"
					className="flex items-center gap-1 whitespace-nowrap"
				>
					<Icon icon="tabler:edit" />
					Edit
				</Button>
			</Link>
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
			<SortableHeader column={column}>Base Price</SortableHeader>
		),
		cell: (info) => (
			<span className="font-medium">${info.getValue().toFixed(2)}</span>
		),
	}),
	columnHelper.accessor('updatedAt', {
		header: ({ column }) => (
			<SortableHeader column={column}>Last Updated</SortableHeader>
		),
		cell: (info) => (
			<span className="hidden text-sm sm:inline">
				{new Date(info.getValue()).toLocaleDateString()}
			</span>
		),
	}),
]);

// Auto-generate slug from name
const generateSlug = (name: string) => {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
};

/**
 * Custom table markup (the "Last Updated" column is hidden on small
 * screens, which DataTableView cannot express).
 */
function RoomsTable({ table }: { table: DataTable<RoomRow> }) {
	'use no memo';
	const rows = table.getRowModel().rows;
	const responsiveClass = (columnId: string) =>
		columnId === 'updatedAt' ? 'hidden sm:table-cell' : '';

	return (
		<>
			<ScrollArea className="w-full">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead
										key={header.id}
										className={responsiveClass(header.id)}
									>
										{header.isPlaceholder ? null : (
											<FlexRender header={header} />
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => (
								<TableRow key={row.id}>
									{row.getAllCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={responsiveClass(cell.column.id)}
										>
											<FlexRender cell={cell} />
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={table.getAllLeafColumns().length}
									className="h-24 text-center"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>

			{/* Pagination */}
			<div className="flex flex-col items-center justify-between gap-4 space-x-2 py-4 sm:flex-row">
				<div className="order-2 text-sm text-muted-foreground sm:order-1">
					Showing {table.getFilteredRowModel().rows.length} room(s)
				</div>
				<div className="order-1 space-x-2 sm:order-2">
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
		</>
	);
}

function PropertyManagement() {
	const roomNameId = useId();
	const roomSlugId = useId();
	const roomDescriptionId = useId();
	const basePriceId = useId();
	const [editMode, setEditMode] = useState<EditMode>('none');
	const [formData, setFormData] = useState<RoomFormData>({
		name: '',
		slug: '',
		description: '',
		basePrice: 0,
		status: 'active',
		isActive: true,
	});
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: roomsData } = useSuspenseQuery(
		trpc.rooms.adminList.queryOptions(ROOMS_INPUT),
	);

	const rooms = roomsData.rooms;

	const createRoomMutation = useMutation(
		trpc.rooms.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(trpc.rooms.adminList.pathFilter());
				void queryClient.invalidateQueries(trpc.rooms.list.pathFilter());
				setEditMode('none');
			},
			onError: (error) => {
				console.error('Failed to add room:', error);
			},
		}),
	);

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
		createRoomMutation.mutate(formData);
	};

	const handleCancelEdit = () => {
		setEditMode('none');
	};

	const handleNameChange = (name: string) => {
		setFormData((prev) => ({
			...prev,
			name,
			slug: generateSlug(name),
		}));
	};

	const table = useAppTable({
		data: rooms,
		columns,
	});

	return (
		<AdminLayout title="Property Management">
			<div className="mb-6">
				<p className="text-muted-foreground">Manage rooms for the property</p>
			</div>

			{/* Add Room Form */}
			{editMode === 'add' && (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Add New Room
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label
								htmlFor={roomNameId}
								className="mb-1 block text-sm font-medium"
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
								className="mb-1 block text-sm font-medium"
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
								className="mb-1 block text-sm font-medium"
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
								className="mb-1 block text-sm font-medium"
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
					<CardContent className="space-y-4 py-8 text-center">
						<Icon icon="tabler:home" className="mx-auto size-12 text-primary" />
						<h3 className="text-lg font-medium">No rooms found</h3>
						<p className="text-muted-foreground">
							Get started by adding your first room.
						</p>
						<Button onClick={handleAddRoom} className="flex items-center gap-2">
							<Icon icon="tabler:circle-plus-filled" />
							Add Your First Room
						</Button>
					</CardContent>
				</Card>
			) : (
				<Card className="max-w-full overflow-hidden">
					<CardHeader>
						<div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
							<CardTitle>
								Rooms ({table.getFilteredRowModel().rows.length})
							</CardTitle>
							<div className="flex w-full items-center gap-2 sm:w-auto">
								<div className="relative w-full sm:w-[300px]">
									<Icon
										icon="tabler:search"
										className="absolute top-1/2 left-2 size-4 -translate-y-1/2 transform text-muted-foreground"
									/>
									<Input
										placeholder="Search rooms..."
										value={table.state.globalFilter ?? ''}
										onChange={(event) =>
											table.setGlobalFilter(String(event.target.value))
										}
										className="pl-8"
									/>
								</div>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<RoomsTable table={table} />
					</CardContent>
				</Card>
			)}
		</AdminLayout>
	);
}
