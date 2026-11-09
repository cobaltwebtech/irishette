import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import {
	CHECK_IN_TIME,
	CHECK_OUT_TIME_LABEL,
	formatTimeOfDay,
} from '@/lib/site';
import { bookingActions } from '@/stores';
import { parseISODateString } from '@/utils/booking-utils';
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

const CHECK_IN_LABEL = formatTimeOfDay(CHECK_IN_TIME, { withZone: true });

type BannerKind = 'confirmed' | 'processing' | 'unpaid' | 'cancelled';

function bannerKind(status: string, paymentStatus: string): BannerKind {
	if (status === 'confirmed') return 'confirmed';
	if (status === 'cancelled') return 'cancelled';
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
				if (result.status === 'refunded_conflict') {
					toast.error(
						'Sorry, these dates were booked elsewhere moments before your payment completed. Your payment has been refunded in full.',
						{ duration: 10_000 },
					);
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
	const banner = BANNERS[bannerKind(booking.status, booking.paymentStatus)];

	// Calculate number of nights
	const checkIn = parseISODateString(booking.checkInDate);
	const checkOut = parseISODateString(booking.checkOutDate);
	const nights = Math.ceil(
		(checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
	);

	return (
		<section>
			<div className="border-b bg-muted">
				<div className="container mx-auto space-y-1 px-4 py-6 text-center">
					{booking.status === 'confirmed' && (
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
						{booking.status === 'cancelled'
							? 'Your stay was planned for '
							: 'We look forward to seeing you on '}
						{new Date(`${booking.checkInDate}T00:00:00`).toLocaleDateString(
							'en-US',
							{
								weekday: 'long',
								year: 'numeric',
								month: 'long',
								day: 'numeric',
							},
						)}
						.
					</p>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-8 lg:grid-cols-6">
					{/* Left Column - Booking Details */}
					<Card className="lg:col-span-4">
						<CardHeader>
							<CardTitle>Booking Details</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Confirmation ID
									</p>
									<Badge
										variant="secondary"
										className="font-mono text-lg font-semibold tracking-wider"
									>
										{booking.confirmationId}
									</Badge>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Room
									</p>
									<p className="font-semibold">
										{roomData?.name ?? 'Unknown Room'}
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Check-in
									</p>
									<p className="font-semibold">
										{new Date(
											`${booking.checkInDate}T00:00:00`,
										).toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</p>
									<p className="text-sm text-muted-foreground">
										From {CHECK_IN_LABEL}
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Check-out
									</p>
									<p className="font-semibold">
										{new Date(
											`${booking.checkOutDate}T00:00:00`,
										).toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</p>
									<p className="text-sm text-muted-foreground">
										Before {CHECK_OUT_TIME_LABEL}
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Duration
									</p>
									<p className="font-semibold">
										{booking.numberOfNights} night
										{booking.numberOfNights !== 1 ? 's' : ''}
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Guests
									</p>
									<p className="font-semibold">
										{booking.numberOfGuests} guest
										{booking.numberOfGuests !== 1 ? 's' : ''}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					{/* Right Column - Payment Summary */}
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Payment Summary</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-x-4 gap-y-2">
								<p className="text-sm font-medium text-muted-foreground">
									Base Rate
								</p>
								<p className="text-right">
									${(booking.baseAmount / nights).toFixed(2)}/night
								</p>
								<p className="text-sm font-medium text-muted-foreground">
									Subtotal
								</p>
								<p className="text-right">${booking.baseAmount.toFixed(2)}</p>
								{booking.feesAmount !== null && booking.feesAmount > 0 && (
									<>
										<p className="text-sm font-medium text-muted-foreground">
											Fees
										</p>
										<p className="text-right">
											${booking.feesAmount.toFixed(2)}
										</p>
									</>
								)}
								{booking.taxAmount !== null && booking.taxAmount > 0 && (
									<>
										<p className="text-sm font-medium text-muted-foreground">
											Taxes
										</p>
										<p className="text-right">
											${booking.taxAmount.toFixed(2)}
										</p>
									</>
								)}
								<p className="text-lg font-semibold">
									{booking.status === 'confirmed' ? 'Total Paid' : 'Total'}
								</p>
								<p className="text-right text-lg font-semibold">
									${booking.totalAmount.toFixed(2)}
								</p>
							</div>
						</CardContent>
					</Card>
					{/* Left Column - Guest Info */}
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Guest Information</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Name
									</p>
									<p className="font-semibold">{booking.guestName}</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Email
									</p>
									<p className="font-semibold">{booking.guestEmail}</p>
								</div>
								{booking.guestPhone && (
									<div className="sm:col-span-2">
										<p className="text-sm font-medium text-muted-foreground">
											Phone
										</p>
										<p className="font-semibold">{booking.guestPhone}</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
					{/* Right Column - Special Requests */}
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Special Requests</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
								{booking.specialRequests || 'No special requests provided'}
							</div>
						</CardContent>
					</Card>
					{/* Left Column - Important Info */}
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Important Information</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="mx-4 list-disc space-y-2 text-sm text-muted-foreground">
								<li>Check your email for the booking confirmation details</li>
								<li>
									Check-in is available from 3:00 PM. Early check-in may be
									available upon request.
								</li>
								<li>
									Check-out is by {CHECK_OUT_TIME_LABEL}. Late check-out may be
									available upon request.
								</li>
								<li>
									If you need to cancel your booking please review our{' '}
									<Link
										to="/cancellation-refund-policy"
										className="text-accent hover:underline"
										target="_blank"
									>
										Cancellation & Refund Policy
									</Link>
									.
								</li>
								<li>
									If you have any questions or need assistance{' '}
									<Link
										to="/contact"
										className="text-accent hover:underline"
										target="_blank"
									>
										Contact Us
									</Link>
									.
								</li>
								<li className="bg-red-200 text-lg font-bold">
									DO WE NEED ADDITIONAL INSTRUCTIONS FOR THE CUSTOMER?
								</li>
							</ul>
						</CardContent>
					</Card>
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
