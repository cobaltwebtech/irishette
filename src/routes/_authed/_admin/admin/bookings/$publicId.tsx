import { Icon } from '@iconify/react';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { BookingInternalNotes } from '@/components/admin/BookingInternalNotes';
import { DisputesPanel } from '@/components/admin/DisputesPanel';
import { NotificationsPanel } from '@/components/admin/inbox/NotificationsPanel';
import { CancelBookingButton } from '@/components/booking/CancelBookingButton';
import { PaymentStatusBadge } from '@/components/booking/StatusBadges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import { CHECK_IN_TIME_LABEL, CHECK_OUT_TIME_LABEL } from '@/lib/site';

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/$publicId',
)({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. The booking is preloaded for SSR; the guest
	// details (repeat-guest badge) depend on the booking's user publicId.
	loader: async ({ context, params }) => {
		const booking = await orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.bookings.adminGetBooking.queryOptions({
					publicId: params.publicId,
				}),
			),
		);
		if (booking.user) {
			// prefetchQuery never throws: guest details are optional here, a
			// failure only hides the repeat-guest badge (as before).
			await context.queryClient.prefetchQuery(
				context.trpc.users.adminGetGuestDetails.queryOptions({
					publicId: booking.user.publicId,
				}),
			);
		}
	},
	notFoundComponent: BookingNotFound,
	component: AdminBookingDetailPage,
});

function BookingNotFound() {
	return (
		<AdminLayout title="Booking Not Found">
			<Card>
				<CardHeader>
					<CardTitle>Booking Not Found</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-muted-foreground">
						The booking you're looking for could not be found.
					</p>
					<Link to="/admin/bookings/current-bookings">
						<Button>Back to Bookings</Button>
					</Link>
				</CardContent>
			</Card>
		</AdminLayout>
	);
}

function AdminBookingDetailPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();

	const { data: booking } = useSuspenseQuery(
		trpc.bookings.adminGetBooking.queryOptions({ publicId }),
	);

	// Guest details for the repeat-guest badge (`user` is null only if the
	// account was deleted), hence `enabled`.
	const guestPublicId = booking.user?.publicId;
	const { data: guestData } = useQuery(
		trpc.users.adminGetGuestDetails.queryOptions(
			{ publicId: guestPublicId ?? '' },
			{ enabled: !!guestPublicId },
		),
	);

	// Admin can resend for any booking.
	const resendEmail = useMutation(
		trpc.bookings.resendConfirmationEmail.mutationOptions({
			onSuccess: (result) => {
				toast.success('Email sent successfully!', {
					description:
						result.message || 'Confirmation email has been sent to the guest.',
				});
			},
			onError: (error) => {
				console.error('Failed to resend confirmation email:', error);
				toast.error('Failed to send email', {
					description:
						error.message ||
						'Unable to send confirmation email. Please try again.',
				});
			},
		}),
	);
	const isResendingEmail = resendEmail.isPending;

	const handleResendEmail = () => {
		resendEmail.mutate({ publicId: booking.booking.publicId });
	};

	const bookingCount = guestData?.bookings?.length || 0;

	return (
		<AdminLayout title="Booking Details">
			{/* Header */}
			<div className="container mx-auto px-4 py-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Button asChild variant="outline">
						<Link to="/admin/bookings/current-bookings">
							← Back to Bookings
						</Link>
					</Button>
					<h1 className="text-2xl font-bold text-foreground">
						Booking -{' '}
						<span className="font-mono tracking-wider">
							{booking.booking.confirmationId}
						</span>
					</h1>
					<Badge
						variant={
							booking.booking.status === 'confirmed'
								? 'secondary'
								: booking.booking.status === 'cancelled'
									? 'destructive'
									: 'secondary'
						}
						className="text-sm"
					>
						{booking.booking.status.toUpperCase()}
					</Badge>
				</div>
			</div>

			{/* Main Content */}
			<div className="grid gap-8 lg:grid-cols-6">
				{/* Left Column - Booking Details */}
				<Card className="lg:col-span-4">
					<CardHeader>
						<CardTitle>Booking Details</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Confirmation ID
							</p>
							<Badge
								variant="secondary"
								className="font-mono text-lg font-semibold tracking-wider"
							>
								{booking.booking.confirmationId}
							</Badge>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">Room</p>
							<p className="font-semibold">{booking.room.name}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Check-in
							</p>
							<p className="font-semibold">
								{new Date(
									`${booking.booking.checkInDate}T00:00:00`,
								).toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
							<p className="text-sm text-muted-foreground">
								From {CHECK_IN_TIME_LABEL}
							</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Check-out
							</p>
							<p className="font-semibold">
								{new Date(
									`${booking.booking.checkOutDate}T00:00:00`,
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
								{booking.booking.numberOfNights} night
								{booking.booking.numberOfNights !== 1 ? 's' : ''}
							</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Guests
							</p>
							<p className="font-semibold">
								{booking.booking.numberOfGuests} guest
								{booking.booking.numberOfGuests !== 1 ? 's' : ''}
							</p>
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
								$
								{(
									booking.booking.baseAmount / booking.booking.numberOfNights
								).toFixed(2)}
								/night
							</p>
							<p className="text-sm font-medium text-muted-foreground">
								Subtotal
							</p>
							<p className="text-right">
								${booking.booking.baseAmount.toFixed(2)}
							</p>
							{booking.booking.feesAmount !== null &&
								booking.booking.feesAmount > 0 && (
									<>
										<p className="text-sm font-medium text-muted-foreground">
											Fees
										</p>
										<p className="text-right">
											${booking.booking.feesAmount.toFixed(2)}
										</p>
									</>
								)}
							{booking.booking.taxAmount !== null &&
								booking.booking.taxAmount > 0 && (
									<>
										<p className="text-sm font-medium text-muted-foreground">
											Taxes
										</p>
										<p className="text-right">
											${booking.booking.taxAmount.toFixed(2)}
										</p>
									</>
								)}
							<p className="text-lg font-semibold">Total Paid</p>
							<p className="text-right text-lg font-semibold">
								${booking.booking.totalAmount.toFixed(2)}
							</p>
						</div>
					</CardContent>
					<CardFooter className="grid grid-cols-2 border-t">
						<p className="text-sm font-medium text-muted-foreground">
							Payment Status
						</p>
						<p className="text-right">
							<PaymentStatusBadge status={booking.booking.paymentStatus} />
						</p>
					</CardFooter>
				</Card>

				{/* Left Column - Guest Information */}
				<Card className="lg:col-span-4">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Guest Information
							{bookingCount > 1 && (
								<Badge className="bg-accent-4 text-xs">
									<Icon
										icon="tabler:star-filled"
										className="size-4 text-accent"
									/>
									Repeat Guest
								</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Name
								</p>
								<p className="font-semibold">{booking.booking.guestName}</p>
							</div>
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Email
								</p>
								<p className="font-semibold">{booking.booking.guestEmail}</p>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Account Email
								</p>
								<p className="font-semibold">{booking.user?.email || 'N/A'}</p>
							</div>
							{booking.booking.guestPhone && (
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Phone
									</p>
									<p className="font-semibold">{booking.booking.guestPhone}</p>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Right Column - Booking Actions */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Booking Actions</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{booking.booking.stripePaymentIntentId && (
							<Button className="h-auto w-full" asChild>
								<a
									href={`https://dashboard.stripe.com/acct_1RwOD0B1s28979kR/payments/${booking.booking.stripePaymentIntentId}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center"
								>
									<Icon icon="tabler:external-link" className="size-6" />
									<span className="text-center text-wrap">
										View Payment at Stripe
									</span>
								</a>
							</Button>
						)}
						<Button
							onClick={handleResendEmail}
							disabled={isResendingEmail}
							variant="secondary"
							className="h-auto w-full"
						>
							<Icon icon="tabler:mail-forward" className="size-6" />
							<span className="text-wrap">
								{isResendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
							</span>
						</Button>
						{booking.booking.status !== 'cancelled' && (
							<CancelBookingButton
								publicId={booking.booking.publicId}
								mode="admin"
							/>
						)}
					</CardContent>
				</Card>

				{/* Left Column - Special Requests */}
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Special Requests</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
							{booking.booking.specialRequests ||
								'No special requests provided by guest'}
						</div>
					</CardContent>
				</Card>

				{/* Right Column - Internal Notes */}
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Internal Notes</CardTitle>
						<CardDescription>
							Add or edit internal notes for this booking. These notes are only
							visible to admin users and not shown to the guest.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BookingInternalNotes
							bookingId={booking.booking.id}
							currentNotes={booking.booking.internalNotes || ''}
						/>
					</CardContent>
				</Card>

				<DisputesPanel
					className="lg:col-span-full"
					disputes={booking.disputes}
				/>

				<NotificationsPanel
					className="lg:col-span-full"
					bookingPublicId={booking.booking.publicId}
				/>

				{/* Admin Information */}
				<Card className="lg:col-span-full">
					<CardHeader>
						<CardTitle>Admin Information</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Internal Booking ID
								</p>
								<p className="font-mono text-sm">{booking.booking.id}</p>
							</div>
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									User ID
								</p>
								<p className="font-mono text-sm">
									{booking.user?.publicId ?? 'N/A'}
								</p>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Created At
								</p>
								<p className="font-mono text-sm">
									{new Date(booking.booking.createdAt).toLocaleString()}
								</p>
							</div>
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Updated At
								</p>
								<p className="font-mono text-sm">
									{new Date(booking.booking.updatedAt).toLocaleString()}
								</p>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Stripe Customer ID
								</p>
								<p className="font-mono text-sm">
									{booking.booking.stripeCustomerId}
								</p>
							</div>
							{booking.booking.stripePaymentIntentId && (
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Stripe Payment Intent ID
									</p>
									<p className="font-mono text-sm">
										{booking.booking.stripePaymentIntentId}
									</p>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</AdminLayout>
	);
}
