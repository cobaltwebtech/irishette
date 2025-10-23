import { Icon } from '@iconify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';

interface BookingInternalNotesProps {
	bookingId: string;
	currentNotes?: string | null;
}

export function BookingInternalNotes({
	bookingId,
	currentNotes,
}: BookingInternalNotesProps) {
	const queryClient = useQueryClient();
	const notesId = useId();
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState(currentNotes || '');
	const [isSaving, setIsSaving] = useState(false);

	// Reset notes when dialog opens
	const handleOpenChange = (isOpen: boolean) => {
		setOpen(isOpen);
		if (isOpen) {
			setNotes(currentNotes || '');
		}
	};

	// Mutation to update internal notes
	const updateNotesMutation = useMutation({
		mutationFn: async (internalNotes: string) => {
			return await trpcClient.bookings.adminUpdateInternalNotes.mutate({
				bookingId,
				internalNotes,
			});
		},
		onSuccess: async () => {
			// Invalidate the booking query to refetch updated data
			await queryClient.invalidateQueries({
				queryKey: [['bookings', 'getBooking']],
			});
			toast.success('Internal notes updated successfully!');
			setOpen(false);
		},
		onError: (error) => {
			console.error('Failed to update internal notes:', error);
			toast.error('Failed to update notes', {
				description:
					error instanceof Error
						? error.message
						: 'Unable to update internal notes. Please try again.',
			});
		},
	});

	const handleSave = async () => {
		setIsSaving(true);
		try {
			await updateNotesMutation.mutateAsync(notes);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<div className="space-y-2">
				<DialogTrigger asChild>
					<Button variant="secondary" size="sm" className="h-8">
						<Icon icon="tabler:edit" className="size-5" />
						{currentNotes ? 'Edit' : 'Add Notes'}
					</Button>
				</DialogTrigger>
				{currentNotes ? (
					<p className="text-sm bg-accent/30 p-3 rounded-md whitespace-pre-wrap">
						{currentNotes}
					</p>
				) : (
					<p className="text-sm text-muted-foreground italic">
						No internal notes added
					</p>
				)}
			</div>

			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Edit Internal Notes</DialogTitle>
					<DialogDescription>
						Add or edit internal notes for this booking. These notes are only
						visible to admin users and will not be shown to guests.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<Textarea
						id={notesId}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Enter internal notes here..."
						className="min-h-[200px] resize-y"
						maxLength={5000}
					/>
					<p
						className={`text-xs ${
							notes.length > 4900
								? 'text-destructive font-semibold'
								: 'text-muted-foreground'
						}`}
					>
						{notes.length} / 5000 characters
					</p>
					<p className="text-xs text-muted-foreground">
						You can add any relevant information such as special arrangements,
						issues, or follow-up actions needed.
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button type="button" onClick={handleSave} disabled={isSaving}>
						{isSaving ? (
							<>
								<Icon icon="tabler:loader-2" className="animate-spin" />
								Saving...
							</>
						) : (
							<>
								<Icon icon="tabler:check" />
								Save Notes
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
