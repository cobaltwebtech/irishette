import { Icon } from '@iconify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	type AdminCheckout,
	AdminCardPayment,
} from '@/components/admin/booking/AdminCardPayment';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
	NativeSelect,
	NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { arrivalWindowSchema } from '@/lib/booking/arrival-windows';
import { SAME_DAY_CUTOFF_LABEL } from '@/lib/site';
import { formatStayDate } from '@/utils/timezone';

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

interface PendingPayment extends AdminCheckout {
	publicId: string;
	totalCents: number;
}

function NewBookingPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [roomPublicId, setRoomPublicId] = useState('');
	const [range, setRange] = useState<DateRange | undefined>();
	const [form, setForm] = useState<GuestDetailsForm>(EMPTY_FORM);
	const [errors, setErrors] = useState<GuestDetailsErrors>({});
	const [internalNotes, setInternalNotes] = useState('');
	const [payment, setPayment] = useState<PendingPayment | null>(null);

	const { data: roomList } = useQuery(
		trpc.rooms.adminList.queryOptions({ status: 'active', limit: 100 }),
	);
	const rooms = roomList?.rooms ?? [];
	const selectedRoom = rooms.find((r) => r.publicId === roomPublicId);
	const stay = stayFromRange(range);

	const createBooking = useMutation(
		trpc.bookings.adminCreateBooking.mutationOptions(),
	);
	const createSession = useMutation(
		trpc.bookings.adminCreateCheckoutSession.mutationOptions(),
	);
	const confirm = useMutation(
		trpc.bookings.adminConfirmCheckout.mutationOptions(),
	);

	const onChange = <K extends keyof GuestDetailsForm>(
		field: K,
		value: GuestDetailsForm[K],
	) => setForm((current) => ({ ...current, [field]: value }));

	const submit = async (review: {
		acknowledgeLateBooking: boolean;
		totalAmount: number;
	}) => {
		const found = validateGuestDetails(form);
		setErrors(found);
		const arrival = arrivalWindowSchema.safeParse(form.estimatedArrival);
		if (!selectedRoom || !stay || Object.keys(found).length > 0) {
			toast.add({ type: 'error', title: 'Check the guest details' });
			return;
		}
		if (!arrival.success) return;
		try {
			const hold = await createBooking.mutateAsync({
				roomId: selectedRoom.id,
				checkInDate: stay.checkIn,
				checkOutDate: stay.checkOut,
				guestCount: form.numberOfGuests,
				guestName: form.guestName,
				guestEmail: form.guestEmail.trim(),
				guestPhone: form.guestPhone,
				specialRequests: form.specialRequests || undefined,
				estimatedArrival: arrival.data,
				internalNotes: internalNotes || undefined,
				acknowledgeLateBooking: review.acknowledgeLateBooking,
				cardConsent: true,
			});
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
				totalCents: Math.round(review.totalAmount * 100),
			});
		} catch (error) {
			toast.add({
				type: 'error',
				title: errorMessage(error, 'The booking could not be created'),
			});
		}
	};

	const onAuthorized = async (sessionId: string) => {
		if (!payment) return;
		const result = await confirm.mutateAsync({
			publicId: payment.publicId,
			sessionId,
		});
		await queryClient.invalidateQueries({
			queryKey: trpc.bookings.adminListBookings.pathKey(),
		});
		if (
			result.status === 'confirmed' ||
			result.status === 'already_confirmed'
		) {
			toast.add({ type: 'success', title: 'Booking confirmed' });
		} else {
			toast.add({
				type: 'error',
				title: 'The booking could not be confirmed. The card was not charged.',
			});
		}
		void navigate({
			to: '/admin/bookings/$publicId',
			params: { publicId: payment.publicId },
		});
	};

	if (payment) {
		return (
			<AdminLayout title="New Booking">
				<Card className="mx-auto max-w-2xl">
					<CardHeader>
						<CardTitle>Card payment</CardTitle>
						<CardDescription>
							Type the card the guest reads out. It is authorized now, charged
							once the dates are confirmed, and kept on file for approved
							changes.
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

	return (
		<AdminLayout title="New Booking">
			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Room and dates</CardTitle>
						<CardDescription>
							Admins can book today at any time. After {SAME_DAY_CUTOFF_LABEL},
							a same-day booking is a late booking with no refund.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<RoomSelect
							rooms={rooms}
							value={roomPublicId}
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

				<Card>
					<CardHeader>
						<CardTitle>Guest</CardTitle>
						<CardDescription>
							Look the guest up by email. A new email creates an account; the
							guest can sign in later with a magic link.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<GuestLookup
							email={form.guestEmail}
							onFound={(guest) =>
								setForm((current) => ({
									...current,
									guestName: current.guestName || guest.name,
									guestPhone: current.guestPhone || guest.phoneNumber || '',
								}))
							}
						/>
						<GuestDetailsFields
							form={form}
							errors={errors}
							onChange={onChange}
							maxGuests={selectedRoom?.maxGuests ?? 1}
						/>
						<InternalNotesField
							value={internalNotes}
							onChange={setInternalNotes}
						/>
					</CardContent>
				</Card>

				{selectedRoom && stay && (
					<ReviewCard
						className="lg:col-span-2"
						roomId={selectedRoom.id}
						roomName={selectedRoom.name}
						checkIn={stay.checkIn}
						checkOut={stay.checkOut}
						guestCount={form.numberOfGuests}
						busy={createBooking.isPending || createSession.isPending}
						onSubmit={submit}
					/>
				)}
			</div>
		</AdminLayout>
	);
}

function RoomSelect({
	rooms,
	value,
	onChange,
}: {
	rooms: Array<{ publicId: string; name: string }>;
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Room</Label>
			<NativeSelect
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full sm:w-72"
			>
				<NativeSelectOption value="" disabled>
					Select a room
				</NativeSelectOption>
				{rooms.map((r) => (
					<NativeSelectOption key={r.publicId} value={r.publicId}>
						{r.name}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
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

function InternalNotesField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Internal notes (admins only)</Label>
			<Textarea
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={3}
				maxLength={5000}
			/>
		</div>
	);
}

function ReviewCard({
	className,
	roomId,
	roomName,
	checkIn,
	checkOut,
	guestCount,
	busy,
	onSubmit,
}: {
	className?: string;
	roomId: string;
	roomName: string;
	checkIn: string;
	checkOut: string;
	guestCount: number;
	busy: boolean;
	onSubmit: (review: {
		acknowledgeLateBooking: boolean;
		totalAmount: number;
	}) => Promise<void>;
}) {
	const trpc = useTRPC();
	const lateId = useId();
	const consentId = useId();
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
		<Card className={className}>
			<CardHeader>
				<CardTitle>Review</CardTitle>
				<CardDescription>
					{roomName}: {formatStayDate(checkIn, 'long')} to{' '}
					{formatStayDate(checkOut, 'long')}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{quote.isError && (
					<p className="text-sm text-destructive">{quote.error.message}</p>
				)}
				{quote.data && <PriceBreakdown quote={quote.data} />}
				{late && (
					<div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
						<p className="font-semibold">Late same-day booking</p>
						<p>
							Check-in is today and it is past {SAME_DAY_CUTOFF_LABEL}. This
							booking is non-refundable if cancelled, and the guest gets a
							notice saying so.
						</p>
						<ConsentCheckbox
							id={lateId}
							checked={acknowledged}
							onChange={setAcknowledged}
							label="I told the guest this late booking cannot be refunded."
						/>
					</div>
				)}
				<ConsentCheckbox
					id={consentId}
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
					{busy ? (
						<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
					) : (
						<Icon icon="tabler:credit-card" className="size-5" />
					)}
					Hold dates and take payment
				</Button>
			</CardContent>
		</Card>
	);
}

function ConsentCheckbox({
	id,
	checked,
	onChange,
	label,
}: {
	id: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<Checkbox
				id={id}
				className="size-5"
				checked={checked}
				onCheckedChange={(value) => onChange(value === true)}
			/>
			<Label htmlFor={id} className="text-sm leading-snug font-normal">
				{label}
			</Label>
		</div>
	);
}
