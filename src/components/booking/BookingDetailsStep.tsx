import { Icon } from '@iconify/react';
import { useEffect, useState } from 'react';

import { GuestDetailsFields } from '@/components/booking/GuestDetailsFields';
import {
	type GuestDetailsErrors,
	type GuestDetailsForm,
	useBookingDetailsSubmit,
	validateGuestDetails,
} from '@/components/booking/use-booking-details-submit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { formatStayDate } from '@/lib/timezone';
import { useBookingStore } from '@/stores';

export function BookingDetailsStep() {
	const booking = useBookingStore();
	const session = useSession();
	const { submit, isSubmitting } = useBookingDetailsSubmit();

	// Room limit (room.max_guests); 2 until the room is loaded.
	const maxGuests = booking.maxGuests ?? 2;
	// Prefill from the session first, then from a saved draft.
	const [form, setForm] = useState<GuestDetailsForm>(() => ({
		guestName: session?.user?.name || booking.guestInfo?.name || '',
		guestEmail: session?.user?.email || booking.guestInfo?.email || '',
		guestPhone: session?.user.phoneNumber || booking.guestInfo?.phone || '',
		numberOfGuests: Math.min(booking.guestCount || 1, maxGuests),
		specialRequests: booking.guestInfo?.specialRequests || '',
	}));
	const [errors, setErrors] = useState<GuestDetailsErrors>({});

	// Validate essential booking data on mount only
	useEffect(() => {
		if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
			console.error(
				'Missing essential booking data on BookingDetailsStep mount:',
				{
					roomId: booking.roomId,
					checkInDate: booking.checkInDate,
					checkOutDate: booking.checkOutDate,
				},
			);
			booking.actions.setError(
				'Missing booking information. Please start from the beginning.',
			);
		}
		// oxlint-disable-next-line react-hooks/exhaustive-deps -- This effect should only run once on mount to validate initial booking data
	}, []);

	const updateField = <K extends keyof GuestDetailsForm>(
		field: K,
		value: GuestDetailsForm[K],
	) => setForm((current) => ({ ...current, [field]: value }));

	const handleContinue = async () => {
		const newErrors = validateGuestDetails(form);
		setErrors(newErrors);
		if (Object.keys(newErrors).length > 0) return;
		await submit(form);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:user-circle" className="size-6" />
					Booking Details Step
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<GuestDetailsFields
					form={form}
					errors={errors}
					onChange={updateField}
					maxGuests={maxGuests}
				/>

				<DetailsSummary guests={form.numberOfGuests} />

				{booking.error && (
					<div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
						<p className="text-sm text-destructive">{booking.error}</p>
					</div>
				)}

				<div className="flex gap-3">
					<Button
						variant="outline"
						onClick={() => {
							// Back to the room page the booking started from.
							window.location.href = booking.roomSlug
								? `/rooms/${booking.roomSlug}`
								: '/';
						}}
						className="flex-1"
						disabled={isSubmitting}
					>
						Back
					</Button>
					<Button
						onClick={handleContinue}
						className="flex-1"
						disabled={isSubmitting}
					>
						{isSubmitting ? (
							<>
								<Icon icon="tabler:loader-2" className="size-3 animate-spin" />
								Processing...
							</>
						) : (
							'Continue to Payment'
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

/** Room, dates, guests and the current total. */
function DetailsSummary({ guests }: { guests: number }) {
	const booking = useBookingStore();
	const stayDate = (date: string | null) =>
		date ? formatStayDate(date, 'mediumWeekday') : 'N/A';

	return (
		<Card className="bg-muted">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:checklist" className="size-6" />
					Booking Summary
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-1 text-sm font-semibold">
					<p>
						<span className="font-light">Room:</span>{' '}
						{booking.roomName || booking.roomSlug || 'N/A'}
					</p>
					<p>
						<span className="font-light">Check-in:</span>{' '}
						{stayDate(booking.checkInDate)}
					</p>
					<p>
						<span className="font-light">Check-out:</span>{' '}
						{stayDate(booking.checkOutDate)}
					</p>
					<p>
						<span className="font-light">Guests:</span> {guests}
					</p>
					<p>
						<span className="font-light">Total Due (USD):</span> $
						{booking.pricing?.totalAmount?.toFixed(2) || '0.00'}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
