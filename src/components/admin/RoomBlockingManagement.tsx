import { Icon } from '@iconify/react';
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import type {
	CreateBlockedPeriod,
	RoomBlockedPeriod,
	UpdateBlockedPeriod,
} from '@/lib/room-validation';

// Helper function to format date strings without timezone offset issues
function formatDateString(dateString: string): string {
	// Parse the date string (YYYY-MM-DD) and format it without timezone conversion
	const [year, month, day] = dateString.split('-').map(Number);
	const date = new Date(year, month - 1, day); // month is 0-indexed
	return date.toLocaleDateString();
}

// Helper function to parse validation errors into human-readable messages
function parseValidationErrors(errorMessage: string): string {
	try {
		const errors = JSON.parse(errorMessage);
		if (Array.isArray(errors)) {
			const fieldErrors = errors.map(
				(error: { code: string; path?: string[]; message?: string }) => {
					const field = error.path ? error.path[0] : 'unknown field';
					return `${field}: ${error.message || error.code}`;
				},
			);
			return fieldErrors.join(', ');
		}
		return errorMessage;
	} catch {
		return errorMessage;
	}
}

interface RoomBlockingManagementProps {
	roomId: string;
	onCreateBlockedPeriod: (period: CreateBlockedPeriod) => Promise<void>;
	onUpdateBlockedPeriod: (period: UpdateBlockedPeriod) => Promise<void>;
	onDeleteBlockedPeriod: (periodId: string) => Promise<void>;
	blockedPeriods: RoomBlockedPeriod[];
	isLoading?: boolean;
}

export function RoomBlockingManagement({
	roomId,
	onCreateBlockedPeriod,
	onUpdateBlockedPeriod,
	onDeleteBlockedPeriod,
	blockedPeriods,
	isLoading = false,
}: RoomBlockingManagementProps) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [editingPeriod, setEditingPeriod] = useState<RoomBlockedPeriod | null>(
		null,
	);
	const [deletingPeriod, setDeletingPeriod] =
		useState<RoomBlockedPeriod | null>(null);
	const [sorting, setSorting] = useState<SortingState>([
		{ id: 'startDate', desc: false },
	]);

	const handleCreatePeriod = async (period: CreateBlockedPeriod) => {
		try {
			await onCreateBlockedPeriod(period);
			setShowCreateDialog(false);
		} catch (error) {
			console.error('Error creating blocked period:', error);
			// Error handling is done in the parent component
		}
	};

	const handleUpdatePeriod = async (period: UpdateBlockedPeriod) => {
		try {
			await onUpdateBlockedPeriod(period);
			setEditingPeriod(null);
		} catch (error) {
			console.error('Error updating blocked period:', error);
			// Error handling is done in the parent component
		}
	};

	const handleDeletePeriod = async (periodId: string) => {
		try {
			await onDeleteBlockedPeriod(periodId);
			setDeletingPeriod(null);
		} catch (error) {
			console.error('Error deleting blocked period:', error);
			// Error handling is done in the parent component
		}
	};

	// Filter blocked periods to show only current and future periods
	const filteredBlockedPeriods = useMemo(() => {
		return blockedPeriods.filter((period) => {
			const endDate = new Date(`${period.endDate}T23:59:59`);
			const today = new Date();
			today.setHours(0, 0, 0, 0); // Reset time to start of day
			return endDate >= today;
		});
	}, [blockedPeriods]);

	// Helper function to format date range
	const formatDateRange = (startDate: string, endDate: string) => {
		const start = formatDateString(startDate);
		const end = formatDateString(endDate);
		return `${start} - ${end}`;
	};

	// Create columns using the column helper
	const columnHelper = createColumnHelper<RoomBlockedPeriod>();

	const columns = [
		columnHelper.accessor('startDate', {
			header: ({ column }) => (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
					className="h-8 px-2"
				>
					Date Range
					<Icon icon="tabler:arrows-up-down" />
				</Button>
			),
			cell: (info) => (
				<span className="text-sm">
					{formatDateRange(info.getValue(), info.row.original.endDate)}
				</span>
			),
		}),
		columnHelper.accessor('reason', {
			header: 'Reason',
			cell: (info) => <span>{info.getValue()}</span>,
		}),
		columnHelper.accessor('notes', {
			header: 'Notes',
			cell: (info) => {
				const notes = info.getValue();
				return notes ? (
					<span className="text-sm text-muted-foreground">
						{notes.length > 50 ? `${notes.substring(0, 50)}...` : notes}
					</span>
				) : (
					<span className="text-sm text-muted-foreground italic">No notes</span>
				);
			},
		}),
		columnHelper.display({
			id: 'duration',
			header: 'Duration',
			cell: (info) => {
				const startDate = new Date(info.row.original.startDate);
				const endDate = new Date(info.row.original.endDate);
				const duration = Math.ceil(
					(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
				);
				return (
					<Badge variant="outline">
						{duration} {duration === 1 ? 'Day' : 'Days'}
					</Badge>
				);
			},
		}),
		columnHelper.display({
			id: 'actions',
			header: 'Actions',
			cell: (info) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Open menu</span>
							<Icon icon="tabler:dots" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => setEditingPeriod(info.row.original)}
						>
							<Icon icon="tabler:pencil" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setDeletingPeriod(info.row.original)}
							className="text-destructive"
						>
							<Icon icon="tabler:trash" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		}),
	];

	const table = useReactTable({
		data: filteredBlockedPeriods,
		columns,
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		state: {
			sorting,
		},
	});

	return (
		<Card>
			<CardHeader className="flex justify-between gap-12">
				<div>
					<CardTitle className="text-lg flex items-center gap-2">
						<Icon icon="tabler:calendar-pause" className="size-6" />
						Blocked Periods
					</CardTitle>
					<CardDescription>
						Manage dates when this room is unavailable for booking. Only current
						and future blocked periods are displayed.
					</CardDescription>
				</div>
				<Button
					variant="secondary"
					onClick={() => setShowCreateDialog(true)}
					size="sm"
				>
					<Icon icon="tabler:calendar-plus" />
					Add Blocked Dates
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">
							Loading blocked periods...
						</div>
					</div>
				) : filteredBlockedPeriods.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<Icon
							icon="tabler:calendar-x"
							className="size-12 text-secondary mx-auto mb-4"
						/>
						<h3 className="text-lg font-medium">
							No current blocked periods for room
						</h3>
						<p className="text-sm mb-4">
							Add blocked dates to prevent bookings during specific periods.
						</p>
					</div>
				) : (
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
										No blocked periods found.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				)}
			</CardContent>

			{/* Create Dialog */}
			<CreateBlockedPeriodDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onSubmit={handleCreatePeriod}
				roomId={roomId}
			/>

			{/* Edit Dialog */}
			{editingPeriod && (
				<EditBlockedPeriodDialog
					open={!!editingPeriod}
					onOpenChange={() => setEditingPeriod(null)}
					onSubmit={handleUpdatePeriod}
					period={editingPeriod}
				/>
			)}

			{/* Delete Dialog */}
			{deletingPeriod && (
				<DeleteBlockedPeriodDialog
					open={!!deletingPeriod}
					onOpenChange={() => setDeletingPeriod(null)}
					onConfirm={() => {
						if (deletingPeriod.id) {
							handleDeletePeriod(deletingPeriod.id);
						}
					}}
					period={deletingPeriod}
				/>
			)}
		</Card>
	);
}

// Create Dialog Component
interface CreateBlockedPeriodDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (period: CreateBlockedPeriod) => void;
	roomId: string;
}

function CreateBlockedPeriodDialog({
	open,
	onOpenChange,
	onSubmit,
	roomId,
}: CreateBlockedPeriodDialogProps) {
	const [startDate, setStartDate] = useState('');
	const [endDate, setEndDate] = useState('');
	const [reason, setReason] = useState('');
	const [notes, setNotes] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const startDateId = useId();
	const endDateId = useId();
	const reasonId = useId();
	const notesId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!startDate || !endDate || !reason.trim()) {
			toast.error('Please fill in all required fields');
			return;
		}

		setIsSubmitting(true);
		try {
			onSubmit({
				roomId,
				startDate,
				endDate,
				reason: reason.trim(),
				notes: notes.trim() || undefined,
			});

			// Reset form
			setStartDate('');
			setEndDate('');
			setReason('');
			setNotes('');

			toast.success('Blocked period created successfully!');
		} catch (error) {
			console.error('Error creating blocked period:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			toast.error('Failed to create blocked period', {
				description: parseValidationErrors(errorMessage),
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const resetAndClose = () => {
		setStartDate('');
		setEndDate('');
		setReason('');
		setNotes('');
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={resetAndClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add Blocked Period</DialogTitle>
					<DialogDescription>
						Block this room from being available for booking during a specific
						date range.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor={startDateId}>Start Date</Label>
							<Input
								id={startDateId}
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={endDateId}>End Date</Label>
							<Input
								id={endDateId}
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								required
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor={reasonId}>Reason</Label>
						<Input
							id={reasonId}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g., Maintenance, Personal use, Renovations"
							required
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor={notesId}>Notes (optional)</Label>
						<Input
							id={notesId}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Additional details about this blocked period"
						/>
					</div>

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={resetAndClose}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? 'Creating...' : 'Create'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Edit Dialog Component
interface EditBlockedPeriodDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (period: UpdateBlockedPeriod) => void;
	period: RoomBlockedPeriod;
}

function EditBlockedPeriodDialog({
	open,
	onOpenChange,
	onSubmit,
	period,
}: EditBlockedPeriodDialogProps) {
	const [startDate, setStartDate] = useState(period.startDate);
	const [endDate, setEndDate] = useState(period.endDate);
	const [reason, setReason] = useState(period.reason);
	const [notes, setNotes] = useState(period.notes || '');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const startDateId = useId();
	const endDateId = useId();
	const reasonId = useId();
	const notesId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!startDate || !endDate || !reason.trim()) {
			toast.error('Please fill in all required fields');
			return;
		}

		if (!period.id) {
			toast.error('Invalid period - missing ID');
			return;
		}

		setIsSubmitting(true);
		try {
			await onSubmit({
				id: period.id,
				startDate,
				endDate,
				reason: reason.trim(),
				notes: notes.trim() || undefined,
			});

			toast.success('Blocked period updated successfully!');
		} catch (error) {
			console.error('Error updating blocked period:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			toast.error('Failed to update blocked period', {
				description: parseValidationErrors(errorMessage),
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit Blocked Period</DialogTitle>
					<DialogDescription>
						Update the details of this blocked period.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor={startDateId}>Start Date</Label>
							<Input
								id={startDateId}
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={endDateId}>End Date</Label>
							<Input
								id={endDateId}
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								required
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor={reasonId}>Reason</Label>
						<Input
							id={reasonId}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g., Maintenance, Personal use, Renovations"
							required
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor={notesId}>Notes (optional)</Label>
						<Input
							id={notesId}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Additional details about this blocked period"
						/>
					</div>

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? 'Updating...' : 'Update'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Delete Dialog Component
interface DeleteBlockedPeriodDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	period: RoomBlockedPeriod;
}

function DeleteBlockedPeriodDialog({
	open,
	onOpenChange,
	onConfirm,
	period,
}: DeleteBlockedPeriodDialogProps) {
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await onConfirm();
			toast.success('Blocked period deleted successfully!');
		} catch (error) {
			console.error('Error deleting blocked period:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			toast.error('Failed to delete blocked period', {
				description: errorMessage,
			});
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete Blocked Period</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this blocked period? This action
						cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border p-4 bg-muted/20">
					<div className="space-y-2">
						<div className="flex justify-between">
							<span className="text-sm font-medium">Period:</span>
							<span className="text-sm">
								{formatDateString(period.startDate)} -{' '}
								{formatDateString(period.endDate)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-sm font-medium">Reason:</span>
							<span className="text-sm">{period.reason}</span>
						</div>
						{period.notes && (
							<div className="flex justify-between">
								<span className="text-sm font-medium">Notes:</span>
								<span className="text-sm">{period.notes}</span>
							</div>
						)}
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={isDeleting}
					>
						{isDeleting ? 'Deleting...' : 'Delete'}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
