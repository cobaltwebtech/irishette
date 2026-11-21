import { Icon } from '@iconify/react';
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
import { buttonVariants } from '@/components/ui/button';
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
import type { RouterOutputs } from '@/integrations/trpc/types';
import { addDays, daysBetween, MAX_NIGHTS } from '@/utils/date-range';
import { formatMoney } from '@/utils/format';
import { formatStayDate } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';
import { useTodayCT } from '@/utils/use-now';

// Admin reservation changes by phone (plan 06): move the dates, extend or
// change the room (full reprice at current rates; the difference is charged
// to the card on file or refunded), or release the room early (no refund).
// A card on file that can't be charged falls back to a card the guest reads
// out. The booking is loaded by the layout route ($publicId.tsx).

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/$publicId/modify',
)({
	head: () => ({ meta: [{ title: 'Modify Reservation | Irishette.com' }] }),
	component: ModifyReservationPage,
});

type AdminBooking = RouterOutputs['bookings']['adminGetBooking'];

function ModifyReservationPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(
		trpc.bookings.adminGetBooking.queryOptions({ publicId }),
	);
	const { booking, room } = data;
	const back = (
		<Link
			to="/admin/bookings/$publicId"
			params={{ publicId }}
			className={cn(buttonVariants({ variant: 'outline' }))}
		>
			← Back to booking
		</Link>
	);
	return (
		<AdminLayout title="Modify Reservation">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">
						Modify{' '}
						<span className="font-mono tracking-wider">
							{booking.confirmationId}
						</span>
					</h1>
					<p className="text-muted-foreground">
						{room.name}: {formatStayDate(booking.checkInDate, 'long')} to{' '}
						{formatStayDate(booking.checkOutDate, 'long')} (
						{booking.numberOfNights} night
						{booking.numberOfNights === 1 ? '' : 's'},{' '}
						{formatMoney(booking.totalAmount)})
					</p>
				</div>
				{back}
			</div>
			{booking.status !== 'confirmed' ? (
				<p className="text-muted-foreground">
					Only confirmed bookings can be changed.
				</p>
			) : (
				<div className="grid gap-6 lg:grid-cols-3">
					<ChangeStayCard className="lg:col-span-2" data={data} />
					<ReleaseEarlyCard booking={booking} />
				</div>
			)}
		</AdminLayout>
	);
}

interface Target {
	roomId: string;
	checkInDate: string;
	checkOutDate: string;
}

function ChangeStayCard({
	className,
	data,
}: {
	className?: string;
	data: AdminBooking;
}) {
	const { booking, room } = data;
	const trpc = useTRPC();
	const today = useTodayCT();
	const { data: roomList } = useQuery(
		trpc.rooms.adminList.queryOptions({ status: 'active', limit: 100 }),
	);
	const rooms = roomList?.rooms ?? [];
	const [roomPublicId, setRoomPublicId] = useState(room.publicId);
	const [range, setRange] = useState<DateRange | undefined>();
	const [newCheckOut, setNewCheckOut] = useState('');
	// A stay already under way keeps its check-in: it can only be extended.
	const inStay = booking.checkInDate < today;
	const selectedRoom = rooms.find((r) => r.publicId === roomPublicId);
	const roomId = selectedRoom?.id ?? booking.roomId;

	const stay = stayFromRange(range);
	const target: Target | null = inStay
		? newCheckOut
			? {
					roomId: booking.roomId,
					checkInDate: booking.checkInDate,
					checkOutDate: newCheckOut,
				}
			: null
		: stay
			? { roomId, checkInDate: stay.checkIn, checkOutDate: stay.checkOut }
			: null;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Change dates or room</CardTitle>
				<CardDescription>
					The new stay is priced in full at today's rates. It cannot be shorter
					than now ({booking.numberOfNights} night
					{booking.numberOfNights === 1 ? '' : 's'}); for an early departure,
					release the room instead.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{inStay ? (
					<ExtendSelect
						checkIn={booking.checkInDate}
						checkOut={booking.checkOutDate}
						value={newCheckOut}
						onChange={setNewCheckOut}
					/>
				) : (
					<>
						<RoomSelect
							rooms={rooms}
							value={roomPublicId}
							onChange={(value) => {
								setRoomPublicId(value);
								setRange(undefined);
							}}
						/>
						<AdminStayPicker
							key={roomPublicId}
							roomPublicId={roomPublicId}
							excludeBookingPublicId={booking.publicId}
							selected={range}
							onSelect={setRange}
						/>
					</>
				)}
				{target && (
					<ModificationReview
						key={`${target.roomId}/${target.checkInDate}/${target.checkOutDate}`}
						publicId={booking.publicId}
						target={target}
					/>
				)}
			</CardContent>
		</Card>
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
				{rooms.map((r) => (
					<NativeSelectOption key={r.publicId} value={r.publicId}>
						{r.name}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
	);
}

/** In-stay extension: a later check-out, up to MAX_NIGHTS in total. */
function ExtendSelect({
	checkIn,
	checkOut,
	value,
	onChange,
}: {
	checkIn: string;
	checkOut: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const extra = Math.max(0, MAX_NIGHTS - daysBetween(checkIn, checkOut));
	const options = Array.from({ length: extra }, (_, i) =>
		addDays(checkOut, i + 1),
	);
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>The stay is under way: pick a later check-out</Label>
			<NativeSelect
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full sm:w-72"
			>
				<NativeSelectOption value="" disabled>
					New check-out
				</NativeSelectOption>
				{options.map((date) => (
					<NativeSelectOption key={date} value={date}>
						{formatStayDate(date, 'long')}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
	);
}

function ModificationReview({
	publicId,
	target,
}: {
	publicId: string;
	target: Target;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const noteId = useId();
	const disputeId = useId();
	const [note, setNote] = useState('');
	const [confirmDispute, setConfirmDispute] = useState(false);
	const [checkout, setCheckout] = useState<
		(AdminCheckout & { differenceCents: number; reason: string }) | null
	>(null);
	const input = { publicId, ...target };
	const quote = useQuery(
		trpc.bookings.adminQuoteModification.queryOptions(input, {
			retry: false,
		}),
	);
	const modify = useMutation(
		trpc.bookings.adminModifyBooking.mutationOptions(),
	);
	const createCheckout = useMutation(
		trpc.bookings.adminCreateModificationCheckout.mutationOptions(),
	);
	const confirmCheckout = useMutation(
		trpc.bookings.adminConfirmModificationCheckout.mutationOptions(),
	);

	const done = async (message: string) => {
		await queryClient.invalidateQueries({
			queryKey: trpc.bookings.pathKey(),
		});
		toast.add({ type: 'success', title: message });
		void navigate({ to: '/admin/bookings/$publicId', params: { publicId } });
	};

	const apply = async () => {
		if (!quote.data) return;
		const payload = {
			...input,
			expectedDifferenceCents: quote.data.differenceCents,
			note: note || undefined,
			confirmDisputeRefund: confirmDispute || undefined,
		};
		try {
			const result = await modify.mutateAsync(payload);
			if (result.status === 'applied') {
				await done(
					result.refundFailed
						? 'Reservation changed, but the refund failed: see the alert'
						: 'Reservation changed',
				);
				return;
			}
			const session = await createCheckout.mutateAsync(payload);
			setCheckout({
				clientSecret: session.clientSecret,
				publishableKey: session.publishableKey,
				differenceCents: session.differenceCents,
				reason: result.reason,
			});
		} catch (error) {
			toast.add({
				type: 'error',
				title: errorMessage(error, 'The reservation could not be changed'),
			});
			void quote.refetch();
		}
	};

	if (quote.isPending) {
		return (
			<p className="text-sm text-muted-foreground">Pricing the change...</p>
		);
	}
	if (quote.isError) {
		return <p className="text-sm text-destructive">{quote.error.message}</p>;
	}
	const q = quote.data;
	if (checkout) {
		return (
			<div className="space-y-4">
				<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
					{checkout.reason}
				</p>
				<AdminCardPayment
					clientSecret={checkout.clientSecret}
					publishableKey={checkout.publishableKey}
					expectedCents={checkout.differenceCents}
					onCancel={() => setCheckout(null)}
					onAuthorized={async (sessionId) => {
						try {
							await confirmCheckout.mutateAsync({
								publicId,
								sessionId,
								note: note || undefined,
							});
							await done('Reservation changed');
						} catch (error) {
							toast.add({
								type: 'error',
								title: errorMessage(
									error,
									'The change could not be applied. The card was not charged.',
								),
							});
						}
					}}
				/>
			</div>
		);
	}
	const diff = q.differenceCents / 100;
	const needsDisputeConfirm = q.hasOpenDispute && diff < 0;
	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<PriceBreakdown quote={q.current} title="Now" />
				<PriceBreakdown quote={q.next} title="After the change" />
			</div>
			<p className="text-lg font-semibold">
				{diff > 0
					? `Charge ${formatMoney(diff)} to ${q.savedCard ? `the ${q.savedCard.brand ?? 'card'} ending ${q.savedCard.last4 ?? '????'}` : 'a card the guest reads out'}`
					: diff < 0
						? `Refund ${formatMoney(-diff)} to the card the guest paid with`
						: 'No price difference'}
			</p>
			{needsDisputeConfirm && (
				<div className="flex items-start gap-3 rounded-md border border-destructive p-3 text-sm">
					<Checkbox
						id={disputeId}
						checked={confirmDispute}
						onCheckedChange={(v) => setConfirmDispute(v === true)}
					/>
					<Label htmlFor={disputeId} className="font-normal">
						This payment has an open dispute: refund anyway (it can credit the
						guest twice).
					</Label>
				</div>
			)}
			<div className="space-y-2">
				<Label htmlFor={noteId}>Note (admins only)</Label>
				<Textarea
					id={noteId}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					maxLength={500}
					rows={2}
				/>
			</div>
			<Button
				type="button"
				disabled={
					modify.isPending ||
					createCheckout.isPending ||
					(needsDisputeConfirm && !confirmDispute)
				}
				onClick={() => void apply()}
			>
				<Icon icon="tabler:check" className="size-5" />
				Confirm change
			</Button>
		</div>
	);
}

function ReleaseEarlyCard({ booking }: { booking: AdminBooking['booking'] }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const today = useTodayCT();
	const selectId = useId();
	const noteId = useId();
	const [date, setDate] = useState('');
	const [note, setNote] = useState('');
	const release = useMutation(
		trpc.bookings.adminReleaseRoomEarly.mutationOptions(),
	);
	const first = addDays(booking.checkInDate, 1);
	const start = first > today ? first : today;
	const count = Math.max(0, daysBetween(start, booking.checkOutDate));
	const options = Array.from({ length: count }, (_, i) => addDays(start, i));

	const submit = async () => {
		try {
			await release.mutateAsync({
				publicId: booking.publicId,
				newCheckOutDate: date,
				note: note || undefined,
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.bookings.pathKey(),
			});
			toast.add({ type: 'success', title: 'Room released' });
			void navigate({
				to: '/admin/bookings/$publicId',
				params: { publicId: booking.publicId },
			});
		} catch (error) {
			toast.add({
				type: 'error',
				title: errorMessage(error, 'The room could not be released'),
			});
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Release room early</CardTitle>
				<CardDescription>
					The guest leaves early: the later nights are freed. No refund (early
					departure policy).
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{options.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						There is no earlier check-out date to release from.
					</p>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor={selectId}>New check-out</Label>
							<NativeSelect
								id={selectId}
								value={date}
								onChange={(e) => setDate(e.target.value)}
								className="w-full"
							>
								<NativeSelectOption value="" disabled>
									Pick a date
								</NativeSelectOption>
								{options.map((d) => (
									<NativeSelectOption key={d} value={d}>
										{formatStayDate(d, 'long')}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</div>
						<div className="space-y-2">
							<Label htmlFor={noteId}>Note (admins only)</Label>
							<Textarea
								id={noteId}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								maxLength={500}
								rows={2}
							/>
						</div>
						<Button
							type="button"
							variant="secondary"
							disabled={!date || release.isPending}
							onClick={() => void submit()}
						>
							<Icon icon="tabler:door-exit" className="size-5" />
							Release from this date
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
