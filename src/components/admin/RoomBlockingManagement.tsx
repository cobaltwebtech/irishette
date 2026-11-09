import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import { useId, useState } from 'react';

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
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { TRPCRouter } from '@/integrations/trpc/router';
import { daysBetween } from '@/lib/date-range';
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

/** A reservation a block would overlap (CONFLICT data.conflicts). */
interface BlockConflict {
	publicId: string | null;
	confirmationId: string | null;
	source: string;
	checkIn: string;
	checkOut: string;
	status: string;
}

/** Message and conflicts from a failed save. */
function readSaveError(error: unknown) {
	if (isTRPCClientError<TRPCRouter>(error)) {
		return {
			message: error.message,
			conflicts: (error.data?.conflicts as BlockConflict[] | null) ?? [],
		};
	}
	return {
		message: error instanceof Error ? error.message : 'Unexpected error',
		conflicts: [] as BlockConflict[],
	};
}

const SOURCE_LABELS: Record<string, string> = {
	direct: 'Booking on this site',
	block: 'Blocked period',
	airbnb: 'Airbnb',
	expedia: 'Expedia',
	vrbo: 'Vrbo',
	booking: 'Booking.com',
	other: 'Imported calendar',
};

/** Lists what a block would overlap, inside the dialog. */
function BlockConflictList({
	message,
	conflicts,
}: {
	message: string;
	conflicts: BlockConflict[];
}) {
	return (
		<div
			role="alert"
			className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
		>
			<p className="font-medium text-destructive">{message}</p>
			{conflicts.length > 0 && (
				<ul className="space-y-1">
					{conflicts.map((c) => (
						<li
							key={`${c.source}-${c.publicId ?? ''}-${c.checkIn}-${c.checkOut}`}
							className="flex flex-wrap items-center gap-2"
						>
							<Badge variant="outline">
								{SOURCE_LABELS[c.source] ?? c.source}
							</Badge>
							<span>
								{formatDateString(c.checkIn)} to {formatDateString(c.checkOut)}
							</span>
							<span className="text-muted-foreground">({c.status})</span>
							{c.publicId && (
								<Link
									to="/admin/bookings/$publicId"
									params={{ publicId: c.publicId }}
									className="text-primary underline"
								>
									{c.confirmationId ?? 'Open booking'}
								</Link>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// Helper function to format date range
const formatDateRange = (startDate: string, endDate: string) => {
	const start = formatDateString(startDate);
	const end = formatDateString(endDate);
	return `${start} - ${end}`;
};

const columnHelper = createAppColumnHelper<RoomBlockedPeriod>();

function makeColumns({
	onEdit,
	onDelete,
}: {
	onEdit: (period: RoomBlockedPeriod) => void;
	onDelete: (period: RoomBlockedPeriod) => void;
}) {
	return columnHelper.columns([
		columnHelper.accessor('startDate', {
			header: ({ column }) => (
				<SortableHeader column={column}>Date Range</SortableHeader>
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
				// Inclusive dates: Jun 8 to Jun 10 is 3 days.
				const duration =
					daysBetween(info.row.original.startDate, info.row.original.endDate) +
					1;
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
					<DropdownMenuTrigger
						render={<Button variant="ghost" className="h-8 w-8 p-0" />}
					>
						<span className="sr-only">Open menu</span>
						<Icon icon="tabler:dots" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => onEdit(info.row.original)}>
								<Icon icon="tabler:pencil" />
								Edit
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => onDelete(info.row.original)}
							className="text-destructive"
						>
							<Icon icon="tabler:trash" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		}),
	]);
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

	// Errors propagate to the dialogs, which stay open and show them.
	const handleCreatePeriod = async (period: CreateBlockedPeriod) => {
		await onCreateBlockedPeriod(period);
		setShowCreateDialog(false);
		toast.add({
			type: 'success',
			title: 'Blocked period created successfully!',
		});
	};

	const handleUpdatePeriod = async (period: UpdateBlockedPeriod) => {
		await onUpdateBlockedPeriod(period);
		setEditingPeriod(null);
		toast.add({
			type: 'success',
			title: 'Blocked period updated successfully!',
		});
	};

	const handleDeletePeriod = async (periodId: string) => {
		await onDeleteBlockedPeriod(periodId);
		setDeletingPeriod(null);
	};

	// Filter blocked periods to show only current and future periods
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Reset time to start of day
	const filteredBlockedPeriods = blockedPeriods.filter(
		(period) => new Date(`${period.endDate}T23:59:59`) >= today,
	);

	const columns = makeColumns({
		onEdit: setEditingPeriod,
		onDelete: setDeletingPeriod,
	});

	const table = useAppTable({
		data: filteredBlockedPeriods,
		columns,
		initialState: {
			sorting: [{ id: 'startDate', desc: false }],
		},
	});

	return (
		<Card>
			<CardHeader className="flex justify-between gap-12">
				<div>
					<CardTitle className="flex items-center gap-2 text-lg">
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
					<div className="py-8 text-center text-muted-foreground">
						<Icon
							icon="tabler:calendar-x"
							className="mx-auto mb-4 size-12 text-secondary"
						/>
						<h3 className="text-lg font-medium">
							No current blocked periods for room
						</h3>
						<p className="mb-4 text-sm">
							Add blocked dates to prevent bookings during specific periods.
						</p>
					</div>
				) : (
					<>
						<DataTableView
							table={table}
							emptyMessage="No blocked periods found."
						/>
						<PaginationControls table={table} noun="blocked periods" />
					</>
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
					onConfirm={async () => {
						if (deletingPeriod.id) {
							await handleDeletePeriod(deletingPeriod.id);
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
	onSubmit: (period: CreateBlockedPeriod) => Promise<void>;
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
	const [saveError, setSaveError] = useState<ReturnType<
		typeof readSaveError
	> | null>(null);

	const startDateId = useId();
	const endDateId = useId();
	const reasonId = useId();
	const notesId = useId();

	const resetForm = () => {
		setStartDate('');
		setEndDate('');
		setReason('');
		setNotes('');
		setSaveError(null);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!startDate || !endDate || !reason.trim()) {
			toast.add({ type: 'error', title: 'Please fill in all required fields' });
			return;
		}
		if (endDate < startDate) {
			toast.add({
				type: 'error',
				title: 'End date must be on or after the start date',
			});
			return;
		}

		setIsSubmitting(true);
		setSaveError(null);
		try {
			await onSubmit({
				roomId,
				startDate,
				endDate,
				reason: reason.trim(),
				notes: notes.trim() || undefined,
			});
			resetForm();
		} catch (error) {
			setSaveError(readSaveError(error));
		} finally {
			setIsSubmitting(false);
		}
	};

	const resetAndClose = () => {
		resetForm();
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

					{saveError && <BlockConflictList {...saveError} />}

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
	onSubmit: (period: UpdateBlockedPeriod) => Promise<void>;
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
	const [saveError, setSaveError] = useState<ReturnType<
		typeof readSaveError
	> | null>(null);

	const startDateId = useId();
	const endDateId = useId();
	const reasonId = useId();
	const notesId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!startDate || !endDate || !reason.trim()) {
			toast.add({ type: 'error', title: 'Please fill in all required fields' });
			return;
		}

		if (!period.id) {
			toast.add({ type: 'error', title: 'Invalid period - missing ID' });
			return;
		}

		if (endDate < startDate) {
			toast.add({
				type: 'error',
				title: 'End date must be on or after the start date',
			});
			return;
		}

		setIsSubmitting(true);
		setSaveError(null);
		try {
			await onSubmit({
				id: period.id,
				startDate,
				endDate,
				reason: reason.trim(),
				notes: notes.trim() || undefined,
			});
		} catch (error) {
			setSaveError(readSaveError(error));
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

					{saveError && <BlockConflictList {...saveError} />}

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
	onConfirm: () => Promise<void>;
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
			toast.add({
				type: 'success',
				title: 'Blocked period deleted successfully!',
			});
		} catch (error) {
			console.error('Error deleting blocked period:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			toast.add({
				type: 'error',
				title: 'Failed to delete blocked period',
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

				<div className="rounded-lg border bg-muted/20 p-4">
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
