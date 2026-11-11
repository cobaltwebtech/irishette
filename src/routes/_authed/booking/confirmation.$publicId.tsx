import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';

import {
	BookingGuestCard,
	BookingPaymentCard,
	BookingStayCard,
	DetailField,
	ImportantInfoCard,
	SpecialRequestsCard,
} from '@/components/booking/detail/BookingDetailCards';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type {
	BookingStatus,
	PaymentStatus,
} from '@/lib/booking/booking-status';
import { bookingActions } from '@/stores';
import { formatStayDate } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

export const Route = createFileRoute('/_authed/booking/confirmation/$publicId')(
	{
		head: () => ({
			meta: [
				{
					title: 'Your Booking | Irishette.com',
				},
			],
		}),
		// Stripe returns here after redirect-based payment methods (and the
		// payment step navigates here after checkout.confirm()).
		validateSearch: z.object({
			session_id: z.string().max(255).optional(),
		}),
		// Auth: the _authed layout. Data: preloaded into the per-request
		// QueryClient and read with useSuspenseQuery below.
		loader: ({ context, params }) =>
			orNotFound(
				context.queryClient.ensureQueryData(
					context.trpc.bookings.getBooking.queryOptions({
						publicId: params.publicId,
					}),
				),
			),
		notFoundComponent: BookingNotFound,
		component: BookingConfirmation,
	},
);

function BookingNotFound() {
	const navigate = useNavigate();

	return (
		<div className="container mx-auto max-w-4xl px-4 py-12">
			<Card>
				<CardContent className="py-12">
					<div className="space-y-4 text-center">
						<Icon
							icon="tabler:alert-circle"
							className="mx-auto size-8 text-destructive"
						/>
						<h3 className="text-2xl font-bold text-destructive">
							Booking Not Found
						</h3>
						<p className="text-sm text-muted-foreground">
							The booking you're looking for doesn't exist or you don't have
							permission to view it.
						</p>
						<Button onClick={() => navigate({ to: '/account' })} size="lg">
							<Icon icon="tabler:home" className="size-6" />
							Go to Account
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

type BannerKind =
	| 'confirmed'
	| 'processing'
	| 'unpaid'
	| 'cancelled'
	| 'cancelledUncharged';

function bannerKind(status: string, paymentStatus: string): BannerKind {
	if (status === 'confirmed') return 'confirmed';
	if (status === 'cancelled') {
		// Never captured (dates taken or payment failed): nothing to refund.
		return paymentStatus === 'pending' ? 'cancelledUncharged' : 'cancelled';
	}
	return paymentStatus === 'processing' ? 'processing' : 'unpaid';
}

const BANNERS: Record<
	BannerKind,
	{ icon: string; title: string; text: string; tone: string }
> = {
	confirmed: {
		icon: 'tabler:circle-check-filled',
		title: 'Your Booking is Confirmed!',
		text: 'You will receive a confirmation email shortly with all the details.',
		tone: 'text-primary',
	},
	processing: {
		icon: 'tabler:clock-hour-4',
		title: 'Your Payment is Processing',
		text: 'Your bank is processing the payment. We hold your dates and will email you as soon as it completes.',
		tone: 'text-amber-600',
	},
	unpaid: {
		icon: 'tabler:alert-circle',
		title: 'Payment Not Completed',
		text: 'We have not received your payment for this booking. If your hold expired, please book again.',
		tone: 'text-destructive',
	},
	cancelled: {
		icon: 'tabler:circle-x',
		title: 'This Booking was Cancelled',
		text: 'Any refund goes back to your original payment method within 5-10 business days.',
		tone: 'text-destructive',
	},
	cancelledUncharged: {
		icon: 'tabler:circle-x',
		title: 'This Booking was Not Confirmed',
		text: 'Your card was not charged. If your bank shows a pending authorization, it is released automatically within a few days.',
		tone: 'text-destructive',
	},
};

function BookingConfirmation() {
	const { publicId } = Route.useParams();
	const { session_id: sessionId } = Route.useSearch();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: bookingData } = useSuspenseQuery(
		trpc.bookings.getBooking.queryOptions({ publicId }),
	);

	// Fast path after payment: confirm from the Checkout Session (the
	// webhook does the same; both are idempotent), then show the real status.
	const { mutate: confirmCheckout, isPending: confirming } = useMutation(
		trpc.bookings.confirmCheckout.mutationOptions({
			onSuccess: (result) => {
				if (result.status === 'released') {
					toast.add({
						type: 'error',
						title:
							'Sorry, we could not confirm this booking: the dates were booked elsewhere moments before your payment completed. Your card was not charged.',
						timeout: 10_000,
					});
				} else if (result.status === 'payment_failed') {
					toast.add({
						type: 'error',
						title:
							'Sorry, your payment could not be completed, so the booking was not confirmed. Your card was not charged.',
						timeout: 10_000,
					});
				}
			},
			onSettled: () =>
				queryClient.invalidateQueries(
					trpc.bookings.getBooking.queryFilter({ publicId }),
				),
		}),
	);
	useEffect(() => {
		if (sessionId) confirmCheckout({ publicId, sessionId });
	}, [sessionId, publicId, confirmCheckout]);

	// Clear the booking store when component mounts
	useEffect(() => {
		bookingActions.reset();
	}, []);

	const { booking, room: roomData } = bookingData;

	return (
		<section>
			<ConfirmationBanner
				status={booking.status}
				paymentStatus={booking.paymentStatus}
				checkInDate={booking.checkInDate}
				confirming={confirming}
			/>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-8 lg:grid-cols-6">
					<BookingStayCard
						title="Booking Details"
						booking={booking}
						roomName={roomData?.name ?? 'Unknown Room'}
					/>
					<BookingPaymentCard
						booking={booking}
						totalLabel={booking.status === 'confirmed' ? 'Total Paid' : 'Total'}
					/>
					<BookingGuestCard
						className="lg:col-span-3"
						guestName={booking.guestName}
						guestEmail={booking.guestEmail}
					>
						{booking.guestPhone && (
							<DetailField label="Phone" value={booking.guestPhone} />
						)}
					</BookingGuestCard>
					<SpecialRequestsCard
						className="lg:col-span-3"
						specialRequests={booking.specialRequests}
						emptyText="No special requests provided"
					/>
					<ImportantInfoCard className="lg:col-span-3" />
					{/* Right Column - Address and Directions */}
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Our Address and Directions</CardTitle>
						</CardHeader>
						<CardContent>ADD ADDRESS AND DIRECTIONS HERE</CardContent>
					</Card>
				</div>
				{/* Action Buttons */}
				<div className="mx-auto flex max-w-lg flex-wrap gap-4 pt-8">
					<Link
						to="/"
						data-slot="button"
						className={cn(buttonVariants({ variant: 'secondary' }), 'flex-1')}
					>
						<Icon icon="tabler:home" className="size-5" />
						Go to Home
					</Link>
					<Link
						to="/account"
						data-slot="button"
						className={cn(buttonVariants(), 'flex-1')}
					>
						<Icon
							icon="material-symbols:bed-outline-rounded"
							className="size-5"
						/>
						View All Bookings
					</Link>
				</div>
			</div>
		</section>
	);
}

/** Status banner: confirmed, processing, unpaid or cancelled. */
function ConfirmationBanner({
	status,
	paymentStatus,
	checkInDate,
	confirming,
}: {
	status: BookingStatus;
	paymentStatus: PaymentStatus;
	checkInDate: string;
	confirming: boolean;
}) {
	const banner = BANNERS[bannerKind(status, paymentStatus)];
	return (
		<div className="border-b bg-muted">
			<div className="container mx-auto space-y-1 px-4 py-6 text-center">
				{status === 'confirmed' && (
					<p className="animate-bounce text-4xl">🎉</p>
				)}
				<div className="flex items-center justify-center gap-2">
					<Icon
						icon={confirming ? 'tabler:loader-2' : banner.icon}
						className={`size-8 ${confirming ? 'animate-spin' : ''} ${banner.tone}`}
					/>
					<h1 className="text-2xl font-bold text-foreground">
						{confirming ? 'Confirming your payment...' : banner.title}
					</h1>
				</div>
				{!confirming && <p>{banner.text}</p>}
				<p>
					{status === 'cancelled'
						? 'Your stay was planned for '
						: 'We look forward to seeing you on '}
					{formatStayDate(checkInDate, 'full')}.
				</p>
			</div>
		</div>
	);
}
