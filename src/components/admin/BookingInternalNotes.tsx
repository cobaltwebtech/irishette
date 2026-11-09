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
import { useTRPC } from '@/integrations/trpc/react';

interface BookingInternalNotesProps {
	bookingId: string;
	currentNotes?: string | null;
}

export function BookingInternalNotes({
	bookingId,
	currentNotes,
}: BookingInternalNotesProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const notesId = useId();
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState(currentNotes || '');

	// Reset notes when dialog opens
	const handleOpenChange = (isOpen: boolean) => {
		setOpen(isOpen);
		if (isOpen) {
			setNotes(currentNotes || '');
		}
	};

	// Mutation to update internal notes
	const updateNotesMutation = useMutation(
		trpc.bookings.adminUpdateInternalNotes.mutationOptions({
			onSuccess: async () => {
				// Refetch the booking so the updated notes show up
				await queryClient.invalidateQueries(
					trpc.bookings.adminGetBooking.pathFilter(),
				);
				toast.success('Internal notes updated successfully!');
				setOpen(false);
			},
			onError: (error) => {
				console.error('Failed to update internal notes:', error);
				toast.error('Failed to update notes', {
					description:
						error.message ||
						'Unable to update internal notes. Please try again.',
				});
			},
		}),
	);
	// Stays true until onSuccess (including the refetch) has finished.
	const isSaving = updateNotesMutation.isPending;

	const handleSave = () => {
		updateNotesMutation.mutate({ bookingId, internalNotes: notes });
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<div className="space-y-2">
				<DialogTrigger
					render={<Button variant="secondary" size="sm" className="h-8" />}
				>
					<Icon icon="tabler:edit" className="size-5" />
					{currentNotes ? 'Edit' : 'Add Notes'}
				</DialogTrigger>
				{currentNotes ? (
					<p className="rounded-md bg-accent/30 p-3 text-sm whitespace-pre-wrap">
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
								? 'font-semibold text-destructive'
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
