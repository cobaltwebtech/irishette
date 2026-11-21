import { Icon } from '@iconify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	type AdminCheckout,
	AdminCardPayment,
} from '@/components/admin/booking/AdminCardPayment';
import {
	AdminCheckbox,
	AdminNoteField,
	AdminRoomSelect,
} from '@/components/admin/booking/AdminFormFields';
import {
	AdminStayPicker,
	PriceBreakdown,
} from '@/components/admin/booking/AdminStayPicker';
import { stayFromRange } from '@/components/booking/AvailabilityCalendar';
import { errorMessage } from '@/components/booking/checkout-elements';
import { GuestDetailsFields } from '@/components/booking/GuestDetailsFields';
import {
	type GuestDetailsErrors,
	type GuestDetailsForm,
	validateGuestDetails,
} from '@/components/booking/use-booking-details-submit';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { arrivalWindowSchema } from '@/lib/booking/arrival-windows';
import { SAME_DAY_CUTOFF_LABEL } from '@/lib/site';
import { formatStayDate } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

// Admin booking by phone (plan 06): room, dates (no same-day cutoff), the
// guest's details (account found by email or created), review with the
// guest's verbal consent to keep the card on file, then the card the guest
// reads out (card-only Checkout Session). After payment the usual
// confirmation runs (claim, capture, emails) and the admin lands on the
// booking.

export const Route = createFileRoute('/_authed/_admin/admin/bookings/new')({
	head: () => ({ meta: [{ title: 'New Booking | Irishette.com' }] }),
	component: NewBookingPage,
});

const EMPTY_FORM: GuestDetailsForm = {
	guestName: '',
	guestEmail: '',
	guestPhone: '',
	numberOfGuests: 1,
	estimatedArrival: '',
	specialRequests: '',
};

interface Review {
	acknowledgeLateBooking: boolean;
	totalAmount: number;
}

interface PendingPayment extends AdminCheckout {
	publicId: string;
	totalCents: number;
}

/** The adminCreateBooking input, or null when the guest details are invalid. */
function holdInput(
	form: GuestDetailsForm,
	roomId: string,
	stay: { checkIn: string; checkOut: string },
	internalNotes: string,
	acknowledgeLateBooking: boolean,
) {
	const arrival = arrivalWindowSchema.safeParse(form.estimatedArrival);
	if (!arrival.success) return null;
	return {
		roomId,
		checkInDate: stay.checkIn,
		checkOutDate: stay.checkOut,
		guestCount: form.numberOfGuests,
		guestName: form.guestName,
		guestEmail: form.guestEmail.trim(),
		guestPhone: form.guestPhone,
		specialRequests: form.specialRequests || undefined,
		estimatedArrival: arrival.data,
		internalNotes: internalNotes || undefined,
		acknowledgeLateBooking,
		cardConsent: true as const,
	};
}

/**
 * Holds the dates (adminCreateBooking) and opens the card-only session; the
 * payment step then shows. Null input: the guest details are invalid.
 */
function useCreateAdminHold() {
	const trpc = useTRPC();
	const navigate = useNavigate();
	const [payment, setPayment] = useState<PendingPayment | null>(null);
	const createBooking = useMutation(
		trpc.bookings.adminCreateBooking.mutationOptions(),
	);
	const createSession = useMutation(
		trpc.bookings.adminCreateCheckoutSession.mutationOptions(),
	);
	const submit = async (
		input: ReturnType<typeof holdInput>,
		totalAmount: number,
	) => {
		if (!input) {
			toast.add({ type: 'error', title: 'Check the guest details' });
			return;
		}
		try {
			const hold = await createBooking.mutateAsync(input);
			const session = await createSession.mutateAsync({
				bookingId: hold.bookingId,
			});
			if (session.status === 'complete') {
				void navigate({
					to: '/admin/bookings/$publicId',
					params: { publicId: session.publicId },
				});
				return;
			}
			setPayment({
				publicId: session.publicId,
				clientSecret: session.clientSecret,
				publishableKey: session.publishableKey,
				totalCents: Math.round(totalAmount * 100),
			});
		} catch (error) {
			toast.add({
				type: 'error',
				title: errorMessage(error, 'The booking could not be created'),
			});
		}
	};
	return {
		payment,
		busy: createBooking.isPending || createSession.isPending,
		submit,
	};
}

function NewBookingPage() {
	const trpc = useTRPC();
	const [roomPublicId, setRoomPublicId] = useState('');
	const [range, setRange] = useState<DateRange | undefined>();
	const [form, setForm] = useState<GuestDetailsForm>(EMPTY_FORM);
	const [errors, setErrors] = useState<GuestDetailsErrors>({});
	const [internalNotes, setInternalNotes] = useState('');

	const { data: roomList } = useQuery(
		trpc.rooms.adminList.queryOptions({ status: 'active', limit: 100 }),
	);
	const rooms = roomList?.rooms ?? [];
	const selectedRoom = rooms.find((r) => r.publicId === roomPublicId);
	const stay = stayFromRange(range);

	const onChange = <K extends keyof GuestDetailsForm>(
		field: K,
		value: GuestDetailsForm[K],
	) => setForm((current) => ({ ...current, [field]: value }));

	const { payment, busy, submit } = useCreateAdminHold();
	const onSubmit = (review: Review) => {
		const found = validateGuestDetails(form);
		setErrors(found);
		const input =
			selectedRoom && stay && Object.keys(found).length === 0
				? holdInput(
						form,
						selectedRoom.id,
						stay,
						internalNotes,
						review.acknowledgeLateBooking,
					)
				: null;
		return submit(input, review.totalAmount);
	};

	if (payment) return <BookingPaymentStep payment={payment} />;

	return (
		<AdminLayout title="New Booking">
			{/* Stacked, full width: the two-month calendar needs the room. */}
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Room and dates</CardTitle>
						<CardDescription>
							Admins can book today at any time. After {SAME_DAY_CUTOFF_LABEL},
							a same-day booking is a late booking with no refund.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<AdminRoomSelect
							rooms={rooms}
							value={roomPublicId}
							placeholder="Select a room"
							onChange={(value) => {
								setRoomPublicId(value);
								setRange(undefined);
							}}
						/>
						{roomPublicId && (
							<AdminStayPicker
								key={roomPublicId}
								roomPublicId={roomPublicId}
								selected={range}
								onSelect={setRange}
							/>
						)}
					</CardContent>
				</Card>

				<GuestCard
					form={form}
					errors={errors}
					onChange={onChange}
					onFound={(guest) =>
						setForm((current) => ({
							...current,
							guestName: current.guestName || guest.name,
							guestPhone: current.guestPhone || guest.phoneNumber || '',
						}))
					}
					maxGuests={selectedRoom?.maxGuests ?? 1}
					internalNotes={internalNotes}
					onNotesChange={setInternalNotes}
				/>

				{selectedRoom && stay && (
					<ReviewCard
						roomId={selectedRoom.id}
						roomName={selectedRoom.name}
						checkIn={stay.checkIn}
						checkOut={stay.checkOut}
						guestCount={form.numberOfGuests}
						busy={busy}
						onSubmit={onSubmit}
					/>
				)}
			</div>
		</AdminLayout>
	);
}

function GuestCard({
	form,
	errors,
	onChange,
	onFound,
	maxGuests,
	internalNotes,
	onNotesChange,
}: {
	form: GuestDetailsForm;
	errors: GuestDetailsErrors;
	onChange: <K extends keyof GuestDetailsForm>(
		field: K,
		value: GuestDetailsForm[K],
	) => void;
	onFound: (guest: { name: string; phoneNumber: string | null }) => void;
	maxGuests: number;
	internalNotes: string;
	onNotesChange: (value: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Guest</CardTitle>
				<CardDescription>
					Look the guest up by email. A new email creates an account; the guest
					can sign in later with a magic link.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<GuestLookup email={form.guestEmail} onFound={onFound} />
				<GuestDetailsFields
					form={form}
					errors={errors}
					onChange={onChange}
					maxGuests={maxGuests}
				/>
				<AdminNoteField
					label="Internal notes (admins only)"
					value={internalNotes}
					onChange={onNotesChange}
					maxLength={5000}
					rows={3}
				/>
			</CardContent>
		</Card>
	);
}

/** The card the guest reads out, then the usual confirmation. */
function BookingPaymentStep({ payment }: { payment: PendingPayment }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const confirm = useMutation(
		trpc.bookings.adminConfirmCheckout.mutationOptions(),
	);
	const onAuthorized = async (sessionId: string) => {
		const result = await confirm.mutateAsync({
			publicId: payment.publicId,
			sessionId,
		});
		await queryClient.invalidateQueries({
			queryKey: trpc.bookings.adminListBookings.pathKey(),
		});
		const confirmed =
			result.status === 'confirmed' || result.status === 'already_confirmed';
		toast.add(
			confirmed
				? { type: 'success', title: 'Booking confirmed' }
				: {
						type: 'error',
						title:
							'The booking could not be confirmed. The card was not charged.',
					},
		);
		void navigate({
			to: '/admin/bookings/$publicId',
			params: { publicId: payment.publicId },
		});
	};
	return (
		<AdminLayout title="New Booking">
			<Card className="mx-auto max-w-2xl">
				<CardHeader>
					<CardTitle>Card payment</CardTitle>
					<CardDescription>
						Type the card the guest reads out. It is authorized now, charged
						once the dates are confirmed, and kept on file for approved changes.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AdminCardPayment
						clientSecret={payment.clientSecret}
						publishableKey={payment.publishableKey}
						expectedCents={payment.totalCents}
						onAuthorized={onAuthorized}
					/>
				</CardContent>
			</Card>
		</AdminLayout>
	);
}

function GuestLookup({
	email,
	onFound,
}: {
	email: string;
	onFound: (guest: { name: string; phoneNumber: string | null }) => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<string | null>(null);
	const lookup = async () => {
		const value = email.trim();
		if (!value) {
			setStatus('Type the guest email first.');
			return;
		}
		try {
			const guest = await queryClient.fetchQuery(
				trpc.bookings.adminFindGuest.queryOptions(
					{ email: value },
					{ staleTime: 0 },
				),
			);
			if (!guest) {
				setStatus('No account yet: one is created with the booking.');
				return;
			}
			if (guest.banned) {
				setStatus('This account is banned and cannot be booked.');
				return;
			}
			onFound(guest);
			setStatus(`Existing guest: ${guest.name || guest.email}.`);
		} catch (error) {
			setStatus(errorMessage(error, 'Enter a valid email address.'));
		}
	};
	return (
		<div className="flex flex-wrap items-center gap-3">
			<Button type="button" variant="outline" onClick={() => void lookup()}>
				<Icon icon="tabler:user-search" className="size-5" />
				Look up email
			</Button>
			{status && <p className="text-sm text-muted-foreground">{status}</p>}
		</div>
	);
}

function ReviewCard({
	roomId,
	roomName,
	checkIn,
	checkOut,
	guestCount,
	busy,
	onSubmit,
}: {
	roomId: string;
	roomName: string;
	checkIn: string;
	checkOut: string;
	guestCount: number;
	busy: boolean;
	onSubmit: (review: Review) => Promise<void>;
}) {
	const trpc = useTRPC();
	const [acknowledged, setAcknowledged] = useState(false);
	const [consented, setConsented] = useState(false);
	const quote = useQuery(
		trpc.bookings.adminQuote.queryOptions({
			roomId,
			checkInDate: checkIn,
			checkOutDate: checkOut,
			guestCount,
		}),
	);
	const late = quote.data?.lateSameDay ?? false;
	const ready = quote.data && consented && (!late || acknowledged);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Review</CardTitle>
				<CardDescription>
					{roomName}: {formatStayDate(checkIn, 'long')} to{' '}
					{formatStayDate(checkOut, 'long')}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<QuoteResult quote={quote} />
				{late && (
					<LateBookingNotice
						acknowledged={acknowledged}
						onChange={setAcknowledged}
					/>
				)}
				<AdminCheckbox
					checked={consented}
					onChange={setConsented}
					label="The guest agreed by phone to keep this card on file and to have it charged or refunded for changes they approve."
				/>
				<Button
					type="button"
					disabled={!ready || busy}
					onClick={() =>
						quote.data &&
						void onSubmit({
							acknowledgeLateBooking: acknowledged,
							totalAmount: quote.data.totalAmount,
						})
					}
				>
					<Icon
						icon={busy ? 'tabler:loader-2' : 'tabler:credit-card'}
						className={cn('size-5', busy && 'animate-spin')}
					/>
					Hold dates and take payment
				</Button>
			</CardContent>
		</Card>
	);
}

function QuoteResult({
	quote,
}: {
	quote: {
		data?: React.ComponentProps<typeof PriceBreakdown>['quote'];
		error: { message: string } | null;
	};
}) {
	if (quote.error) {
		return <p className="text-sm text-destructive">{quote.error.message}</p>;
	}
	return quote.data ? <PriceBreakdown quote={quote.data} /> : null;
}

function LateBookingNotice({
	acknowledged,
	onChange,
}: {
	acknowledged: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
			<p className="font-semibold">Late same-day booking</p>
			<p>
				Check-in is today and it is past {SAME_DAY_CUTOFF_LABEL}. This booking
				is non-refundable if cancelled, and the guest gets a notice saying so.
			</p>
			<AdminCheckbox
				checked={acknowledged}
				onChange={onChange}
				label="I told the guest this late booking cannot be refunded."
			/>
		</div>
	);
}
