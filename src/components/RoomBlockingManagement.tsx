import { Calendar, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
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

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
				<div>
					<CardTitle className="flex items-center gap-2">
						<Calendar className="h-5 w-5" />
						Blocked Periods
					</CardTitle>
					<CardDescription>
						Manage dates when this room is unavailable for booking
					</CardDescription>
				</div>
				<Button
					onClick={() => setShowCreateDialog(true)}
					size="sm"
					className="flex items-center gap-2"
				>
					<Plus className="h-4 w-4" />
					Add Blocked Period
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">
							Loading blocked periods...
						</div>
					</div>
				) : blockedPeriods.length === 0 ? (
					<div className="text-center py-8">
						<Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
						<h3 className="text-lg font-medium text-muted-foreground">
							No blocked periods
						</h3>
						<p className="text-sm text-muted-foreground mb-4">
							This room has no blocked periods set up yet.
						</p>
						<Button
							onClick={() => setShowCreateDialog(true)}
							variant="outline"
							size="sm"
						>
							<Plus className="h-4 w-4 mr-2" />
							Add first blocked period
						</Button>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Start Date</TableHead>
								<TableHead>End Date</TableHead>
								<TableHead>Duration</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead>Notes</TableHead>
								<TableHead className="w-[50px]"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{blockedPeriods.map((period) => {
								const startDate = new Date(period.startDate);
								const endDate = new Date(period.endDate);
								const duration = Math.ceil(
									(endDate.getTime() - startDate.getTime()) /
										(1000 * 60 * 60 * 24),
								);

								return (
									<TableRow key={period.id}>
										<TableCell className="font-medium">
											{formatDateString(period.startDate)}
										</TableCell>
										<TableCell>{formatDateString(period.endDate)}</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{duration} {duration === 1 ? 'day' : 'days'}
											</Badge>
										</TableCell>
										<TableCell>{period.reason}</TableCell>
										<TableCell>
											{period.notes ? (
												<span className="text-sm text-muted-foreground">
													{period.notes.length > 50
														? `${period.notes.substring(0, 50)}...`
														: period.notes}
												</span>
											) : (
												<span className="text-sm text-muted-foreground italic">
													No notes
												</span>
											)}
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" className="h-8 w-8 p-0">
														<span className="sr-only">Open menu</span>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem
														onClick={() => setEditingPeriod(period)}
													>
														<Pencil className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => setDeletingPeriod(period)}
														className="text-destructive"
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								);
							})}
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
			await onSubmit({
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
