import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { CancelBookingButton } from '@/components/booking/CancelBookingButton';
import { CancellationPolicySummary } from '@/components/booking/CancellationPolicySummary';
import {
	BookingDetailHeader,
	BookingGuestCard,
	BookingPaymentCard,
	BookingStayCard,
	DetailField,
	ImportantInfoCard,
	SpecialRequestsCard,
} from '@/components/booking/detail/BookingDetailCards';
import { useResendConfirmationEmail } from '@/components/booking/detail/use-resend-confirmation-email';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { cn } from '@/utils/twMerge';

type GuestBookingData = RouterOutputs['bookings']['getBooking'];

export const Route = createFileRoute('/_authed/account/booking/$publicId')({
	head: () => ({
		meta: [
			{
				title: 'Booking Details | Irishette.com',
			},
		],
	}),
	// Auth: the _authed layout. Data: preloaded into the per-request
	// QueryClient (in-process on SSR) and read with useSuspenseQuery below.
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.bookings.getBooking.queryOptions({
					publicId: params.publicId,
				}),
			),
		),
	notFoundComponent: BookingNotFound,
	component: BookingDetailPage,
});

function BookingNotFound() {
	return (
		<div>
			<div className="border-b bg-primary/5">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center gap-4">
						<Link
							to="/account"
							className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
						>
							← Back to Account
						</Link>
					</div>
				</div>
			</div>
			<div className="container mx-auto px-4 py-8">
				<Card>
					<CardHeader>
						<CardTitle>Booking Not Found</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="mb-4 text-muted-foreground">
							The booking you're looking for could not be found.
						</p>
						<Link to="/account">
							<Button>Back to Account</Button>
						</Link>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function BookingDetailPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();

	const { data } = useSuspenseQuery(
		trpc.bookings.getBooking.queryOptions({ publicId }),
	);

	// Final safety check - should not be needed but prevents runtime errors
	if (!data?.booking || !data.room) {
		return (
			<div className="flex items-center justify-center">
				<div className="text-center">
					<div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
					<p className="text-muted-foreground">Loading booking details...</p>
				</div>
			</div>
		);
	}

	const { booking, room } = data;

	return (
		<section>
			{/* Header */}
			<div className="border-b bg-primary/5">
				<div className="container mx-auto px-4 py-6">
					<BookingDetailHeader
						back={
							<Link
								to="/account"
								data-slot="button"
								className={cn(buttonVariants())}
							>
								← Back to Account
							</Link>
						}
						title="Booking Details"
						status={booking.status}
					/>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-8 lg:grid-cols-6">
					<BookingStayCard
						title="Stay Details"
						booking={booking}
						roomName={room.name}
					/>
					<BookingPaymentCard booking={booking} showPaymentStatus />

					<BookingGuestCard
						className="lg:col-span-2"
						guestName={booking.guestName}
						guestEmail={booking.guestEmail}
					>
						{booking.guestPhone && (
							<DetailField label="Phone" value={booking.guestPhone} />
						)}
						{booking.specialRequests && (
							<DetailField label="Special Requests">
								<p className="rounded-md bg-muted p-3 text-sm">
									{booking.specialRequests}
								</p>
							</DetailField>
						)}
					</BookingGuestCard>
					<SpecialRequestsCard
						className="lg:col-span-2"
						specialRequests={booking.specialRequests}
						emptyText="No special requests provided"
					/>
					<GuestBookingActions data={data} />

					<ImportantInfoCard className="lg:col-span-4" />
				</div>
			</div>
		</section>
	);
}

/** The guest's message for a confirmed booking that can't be cancelled. */
function cannotCancelMessage(booking: GuestBookingData['booking']) {
	if (booking.canCancel || booking.status !== 'confirmed') return null;
	return (
		<p className="text-sm text-muted-foreground">
			{booking.stayPhase === 'upcoming'
				? 'This booking cannot be cancelled online.'
				: 'Check-in time has passed, so this booking can no longer be cancelled online.'}{' '}
			Please contact us.
		</p>
	);
}

/** Resend confirmation, contact support, cancel and the cancellation tiers. */
function GuestBookingActions({ data }: { data: GuestBookingData }) {
	const { booking, cancellationPolicy } = data;
	const resendEmail = useResendConfirmationEmail(
		'Confirmation email has been sent to your email address.',
	);
	const isResendingEmail = resendEmail.isPending;

	return (
		<Card className="lg:col-span-2 lg:row-span-2">
			<CardHeader>
				<CardTitle>Booking Actions</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{booking.status === 'confirmed' && (
					<Button
						onClick={() => resendEmail.mutate({ publicId: booking.publicId })}
						disabled={isResendingEmail}
						variant="outline"
						className="w-full"
					>
						<Icon icon="tabler:mail-forward" className="size-6" />
						{isResendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
					</Button>
				)}
				<Link
					to="/contact"
					search={{ booking: booking.confirmationId }}
					data-slot="button"
					className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}
				>
					<Icon icon="tabler:message-circle" className="size-6" />
					Contact Support
				</Link>
				{booking.canCancel && (
					<CancelBookingButton publicId={booking.publicId} mode="guest" />
				)}
				{cannotCancelMessage(booking)}
				{booking.status !== 'cancelled' && cancellationPolicy && (
					<div className="rounded-md bg-muted p-3">
						<p className="mb-1 text-sm font-semibold">Cancellation windows</p>
						<CancellationPolicySummary
							tiers={cancellationPolicy.tiers}
							checkInDate={booking.checkInDate}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
