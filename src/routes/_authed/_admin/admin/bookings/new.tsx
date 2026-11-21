import { Icon } from '@iconify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { z } from 'zod';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	type AdminCheckout,
	AdminCardPayment,
} from '@/components/admin/booking/AdminCardPayment';
import {
	AdminCheckbox,
	AdminNoteField,
	AdminPaymentChoice,
	AdminRoomSelect,
} from '@/components/admin/booking/AdminFormFields';
import {
	AdminStayPicker,
	PriceBreakdown,
} from '@/components/admin/booking/AdminStayPicker';
import {
	HoldCountdownNotice,
	useHoldCountdown,
} from '@/components/admin/booking/HoldCountdown';
import {
	type ReservationSummary,
	ReservationSummaryCard,
} from '@/components/admin/booking/ReservationSummaryCard';
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
import {
	arrivalWindowSchema,
	storedArrivalLabel,
} from '@/lib/booking/arrival-windows';
import { OFFLINE_PAYMENT_LABEL } from '@/lib/booking/payment-methods';
import type { AdminPaymentMethod } from '@/lib/booking/payment-validation';
import { SAME_DAY_CUTOFF_LABEL } from '@/lib/site';
import { formatStayDate } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

// Admin booking by phone (plan 06): room, dates (no same-day cutoff), the
// guest's details (the account with that email is reused, or one is created
// with the booking), review, then payment. A card: the guest's verbal
// consent to keep it on file, then the card the guest reads out (card-only
// Checkout Session) beside a summary of the reservation; the usual
// confirmation runs (claim, capture, emails). Cash/Check/Other: taken
// outside Stripe and reconciled by hand; the booking is confirmed and the
// payment recorded with its taxes at once. Either way the guest gets the
// confirmation email and the admin lands on the booking.

export const Route = createFileRoute('/_authed/_admin/admin/bookings/new')({
	head: () => ({ meta: [{ title: 'New Booking | Irishette.com' }] }),
	component: NewBookingRoute,
});

/** Starts the page over (blank form) when an admin's hold runs out. */
function NewBookingRoute() {
	const [run, setRun] = useState(0);
	return <NewBookingPage key={run} onReset={() => setRun((n) => n + 1)} />;
}

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
	paymentMethod: AdminPaymentMethod;
	totalAmount: number;
	numberOfNights: number;
	lateSameDay: boolean;
}

interface PendingPayment extends AdminCheckout {
	bookingId: string;
	publicId: string;
	/** When the admin's hold lapses (ADMIN_HOLD_MINUTES, server). */
	holdExpiresAt: Date;
	totalCents: number;
	summary: ReservationSummary;
}

/** The adminCreateBooking input, or null when the guest details are invalid. */
function holdInput(
	form: GuestDetailsForm,
	roomId: string,
	stay: { checkIn: string; checkOut: string },
	internalNotes: string,
	review: Review,
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
		acknowledgeLateBooking: review.acknowledgeLateBooking,
		paymentMethod: review.paymentMethod,
		// The consent box is required before a card hold can be submitted.
		cardConsent: review.paymentMethod === 'card',
	};
}

/**
 * Holds the dates (adminCreateBooking), then either records a payment taken
 * outside Stripe (the booking is confirmed) or opens the card-only session
 * (the payment step then shows). Null input: the guest details are invalid.
 */
function useCreateAdminHold() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [payment, setPayment] = useState<PendingPayment | null>(null);
	const createBooking = useMutation(
		trpc.bookings.adminCreateBooking.mutationOptions(),
	);
	const createSession = useMutation(
		trpc.bookings.adminCreateCheckoutSession.mutationOptions(),
	);
	const confirmOffline = useMutation(
		trpc.bookings.adminConfirmOfflinePayment.mutationOptions(),
	);
	const showBooking = (publicId: string) =>
		void navigate({ to: '/admin/bookings/$publicId', params: { publicId } });
	const recordOffline = async (bookingId: string) => {
		const { publicId } = await confirmOffline.mutateAsync({ bookingId });
		await queryClient.invalidateQueries({
			queryKey: trpc.bookings.adminListBookings.pathKey(),
		});
		toast.add({
			type: 'success',
			title: 'Booking confirmed',
			description: `Payment recorded as ${OFFLINE_PAYMENT_LABEL}. The guest gets the confirmation email.`,
		});
		showBooking(publicId);
	};
	const submit = async (
		input: ReturnType<typeof holdInput>,
		summary: ReservationSummary,
		method: AdminPaymentMethod,
	) => {
		if (!input) {
			toast.add({ type: 'error', title: 'Check the guest details' });
			return;
		}
		try {
			const hold = await createBooking.mutateAsync(input);
			if (method === 'offline') {
				await recordOffline(hold.bookingId);
				return;
			}
			const session = await createSession.mutateAsync({
				bookingId: hold.bookingId,
			});
			if (session.status === 'complete') {
				showBooking(session.publicId);
				return;
			}
			setPayment({
				bookingId: hold.bookingId,
				publicId: session.publicId,
				// Always set for a hold; 10 minutes (ADMIN_HOLD_MINUTES) if not.
				holdExpiresAt:
					session.holdExpiresAt ?? new Date(Date.now() + 10 * 60_000),
				clientSecret: session.clientSecret,
				publishableKey: session.publishableKey,
				totalCents: Math.round(summary.totalAmount * 100),
				summary,
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
		busy:
			createBooking.isPending ||
			createSession.isPending ||
			confirmOffline.isPending,
		submit,
	};
}

function NewBookingPage({ onReset }: { onReset: () => void }) {
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
		if (!selectedRoom || !stay || Object.keys(found).length > 0) {
			return submit(null, reservationSummary(form, '', stay, review), 'card');
		}
		return submit(
			holdInput(form, selectedRoom.id, stay, internalNotes, review),
			reservationSummary(form, selectedRoom.name, stay, review),
			review.paymentMethod,
		);
	};

	if (payment) {
		return <BookingPaymentStep payment={payment} onReset={onReset} />;
	}

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

/** What the payment step shows beside the card form. */
function reservationSummary(
	form: GuestDetailsForm,
	roomName: string,
	stay: { checkIn: string; checkOut: string } | null,
	review: Review,
): ReservationSummary {
	return {
		roomName,
		checkIn: stay?.checkIn ?? '',
		checkOut: stay?.checkOut ?? '',
		numberOfNights: review.numberOfNights,
		guestCount: form.numberOfGuests,
		guestName: form.guestName.trim(),
		guestEmail: form.guestEmail.trim(),
		guestPhone: form.guestPhone,
		arrival: storedArrivalLabel(form.estimatedArrival || null),
		specialRequests: form.specialRequests.trim(),
		totalAmount: review.totalAmount,
		lateSameDay: review.lateSameDay,
	};
}

function GuestCard({
	form,
	errors,
	onChange,
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
	maxGuests: number;
	internalNotes: string;
	onNotesChange: (value: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Guest</CardTitle>
				<CardDescription>
					The booking goes on the account with this email, or a new account is
					created with it; the guest can sign in later with a magic link.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<GuestAccountStatus email={form.guestEmail} />
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
/**
 * The admin's hold ran out (ADMIN_HOLD_MINUTES) before the card was taken:
 * release it (session expired, hold deleted) and start the page over. If
 * it was paid meanwhile, show the booking instead.
 */
function useReleaseOnExpiry(payment: PendingPayment, onReset: () => void) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const release = useMutation(trpc.bookings.adminReleaseHold.mutationOptions());
	return async () => {
		try {
			const { outcome } = await release.mutateAsync({
				bookingId: payment.bookingId,
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.bookings.adminListBookings.pathKey(),
			});
			if (outcome === 'confirmed') {
				toast.add({ type: 'success', title: 'Booking confirmed' });
				void navigate({
					to: '/admin/bookings/$publicId',
					params: { publicId: payment.publicId },
				});
				return;
			}
			toast.add({
				type: 'info',
				title: 'The hold expired',
				description:
					'The payment was not taken in time, so the dates were released. Start the booking again.',
			});
		} catch (error) {
			toast.add({
				type: 'error',
				title: errorMessage(error, 'The hold could not be released'),
				description: 'It lapses on its own; the dates are free again.',
			});
		}
		onReset();
	};
}

function BookingPaymentStep({
	payment,
	onReset,
}: {
	payment: PendingPayment;
	onReset: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const confirm = useMutation(
		trpc.bookings.adminConfirmCheckout.mutationOptions(),
	);
	const releaseHold = useReleaseOnExpiry(payment, onReset);
	// A card being confirmed right now wins: its confirmation shows the booking.
	const secondsLeft = useHoldCountdown(payment.holdExpiresAt, () => {
		if (!confirm.isPending) void releaseHold();
	});
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
			<div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
				<HoldCountdownNotice seconds={secondsLeft} className="lg:col-span-2" />
				<ReservationSummaryCard summary={payment.summary} />
				<Card className="h-fit">
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
			</div>
		</AdminLayout>
	);
}

const emailSchema = z.email().max(254);

/**
 * Whether the email already has an account, checked once it is a valid
 * address (no button). Information only: adminCreateBooking reuses the
 * account or creates one when the booking is made.
 */
function GuestAccountStatus({ email }: { email: string }) {
	const trpc = useTRPC();
	const value = email.trim();
	const valid = emailSchema.safeParse(value).success;
	const guest = useQuery({
		...trpc.bookings.adminFindGuest.queryOptions({ email: value }),
		enabled: valid,
	});
	if (!valid || guest.isError) return null;
	if (guest.isPending) {
		return (
			<p className="text-sm text-muted-foreground">
				Checking for an account...
			</p>
		);
	}
	const found = guest.data;
	if (found?.banned) {
		return (
			<p className="text-sm text-destructive">
				This account is banned and cannot be booked.
			</p>
		);
	}
	return (
		<p className="flex items-center gap-2 text-sm text-muted-foreground">
			<Icon
				icon={found ? 'tabler:user-check' : 'tabler:user-plus'}
				className="size-4 shrink-0"
			/>
			{found
				? `Existing guest account: ${found.name || found.email}. The booking is added to it.`
				: 'New guest: an account is created with this booking.'}
		</p>
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
	const [method, setMethod] = useState<AdminPaymentMethod>('card');
	const quote = useQuery(
		trpc.bookings.adminQuote.queryOptions({
			roomId,
			checkInDate: checkIn,
			checkOutDate: checkOut,
			guestCount,
		}),
	);
	const late = quote.data?.lateSameDay ?? false;
	const ready =
		Boolean(quote.data) &&
		(method === 'offline' || consented) &&
		(!late || acknowledged);
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
				<PaymentMethodFields
					method={method}
					onMethodChange={setMethod}
					consented={consented}
					onConsentChange={setConsented}
				/>
				<SubmitHoldButton
					offline={method === 'offline'}
					busy={busy}
					disabled={!ready}
					onClick={() =>
						quote.data &&
						void onSubmit({
							acknowledgeLateBooking: acknowledged,
							paymentMethod: method,
							totalAmount: quote.data.totalAmount,
							numberOfNights: quote.data.numberOfNights,
							lateSameDay: late,
						})
					}
				/>
			</CardContent>
		</Card>
	);
}

const PAYMENT_OPTIONS: Array<{
	value: AdminPaymentMethod;
	label: string;
	description: string;
}> = [
	{
		value: 'card',
		label: 'Card',
		description:
			'The guest reads out a card. It is kept on file for approved changes.',
	},
	{
		value: 'offline',
		label: OFFLINE_PAYMENT_LABEL,
		description:
			'Paid outside Stripe and reconciled by hand. The booking is confirmed now.',
	},
];

/** Card (with the guest's consent) or Cash/Check/Other. */
function PaymentMethodFields({
	method,
	onMethodChange,
	consented,
	onConsentChange,
}: {
	method: AdminPaymentMethod;
	onMethodChange: (method: AdminPaymentMethod) => void;
	consented: boolean;
	onConsentChange: (checked: boolean) => void;
}) {
	return (
		<>
			<AdminPaymentChoice
				legend="Payment"
				value={method}
				onChange={onMethodChange}
				options={PAYMENT_OPTIONS}
			/>
			{method === 'offline' ? (
				<p className="text-sm text-muted-foreground">
					The dates are booked and the payment is recorded with its taxes. The
					guest gets the confirmation email. Only admins can cancel this
					booking; a refund is recorded for you to pay back by hand.
				</p>
			) : (
				<AdminCheckbox
					checked={consented}
					onChange={onConsentChange}
					label="The guest agreed by phone to keep this card on file and to have it charged or refunded for changes they approve."
				/>
			)}
		</>
	);
}

function SubmitHoldButton({
	offline,
	busy,
	disabled,
	onClick,
}: {
	offline: boolean;
	busy: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	const icon = offline ? 'tabler:cash' : 'tabler:credit-card';
	return (
		<Button type="button" disabled={disabled || busy} onClick={onClick}>
			<Icon
				icon={busy ? 'tabler:loader-2' : icon}
				className={cn('size-5', busy && 'animate-spin')}
			/>
			{offline
				? `Book and record ${OFFLINE_PAYMENT_LABEL} payment`
				: 'Hold dates and take payment'}
		</Button>
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
