import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { BookingInternalNotes } from '@/components/admin/BookingInternalNotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/admin/bookings/$bookingId')({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	component: AdminBookingDetailPage,
});

function AdminBookingDetailPage() {
	const params = Route.useParams() as { bookingId: string };
	const bookingId = params.bookingId;
	const { data: session, isPending } = useSession();
	const router = useRouter();
	// useRouteContext not needed since we import trpc directly
	const [isResendingEmail, setIsResendingEmail] = useState(false);

	// Redirect if not admin
	useEffect(() => {
		if (!isPending && (!session || session.user.role !== 'admin')) {
			router.navigate({ to: '/admin' });
		}
	}, [session, isPending, router]);

	// Use tRPC query to fetch booking details (admin version)
	const {
		data: booking,
		isLoading,
		error,
	} = useQuery(
		trpc.bookings.getBooking.queryOptions(
			{
				bookingId: bookingId,
				// Don't pass userId for admin access - this ensures we get user data
			},
			{
				enabled:
					!isPending &&
					!!session?.user?.id &&
					session.user.role === 'admin' &&
					!!bookingId,
				retry: false,
				staleTime: 5 * 60 * 1000,
			},
		),
	);

	// Handle resending confirmation email (admin can resend for any booking)
	const handleResendEmail = async () => {
		if (!booking?.booking || !session?.user?.id) return;

		setIsResendingEmail(true);

		try {
			console.log(
				'Admin resending confirmation email for booking:',
				booking.booking.id,
			);

			// Use tRPC endpoint to resend confirmation email
			const result = await trpcClient.bookings.resendConfirmationEmail.mutate({
				bookingId: booking.booking.id,
				// Don't pass userId for admin access
			});

			toast.success('Email sent successfully!', {
				description:
					result.message || 'Confirmation email has been sent to the guest.',
			});
		} catch (error) {
			console.error('Failed to resend confirmation email:', error);
			toast.error('Failed to send email', {
				description:
					error instanceof Error
						? error.message
						: 'Unable to send confirmation email. Please try again.',
			});
		} finally {
			setIsResendingEmail(false);
		}
	};

	// Early returns consolidated - AdminLayout will handle auth
	if (
		isPending ||
		isLoading ||
		!session ||
		session.user.role !== 'admin' ||
		!booking ||
		!booking.booking ||
		!booking.room
	) {
		return null; // AdminLayout will handle loading/auth states
	}

	if (error) {
		return (
			<AdminLayout title="Booking Error">
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-red-600 mb-4">
							{error instanceof Error
								? error.message
								: 'Failed to load booking details'}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={() => window.location.reload()}
							>
								Try Again
							</Button>
							<Link to="/admin/bookings/current-bookings">
								<Button>Back to Bookings</Button>
							</Link>
						</div>
					</CardContent>
				</Card>
			</AdminLayout>
		);
	}

	return (
		<AdminLayout title={`Booking: ${booking.booking.confirmationId}`}>
			<div className="mb-6 flex items-center justify-between">
				<Link to="/admin/bookings/current-bookings">
					<Button variant="outline" size="sm">
						← Back to Bookings
					</Button>
				</Link>
				<div className="flex items-center gap-2">
					<Badge
						variant={
							booking.booking.status === 'confirmed'
								? 'default'
								: booking.booking.status === 'cancelled'
									? 'destructive'
									: 'secondary'
						}
						className="text-sm"
					>
						{booking.booking.status.toUpperCase()}
					</Badge>
					<Badge
						variant={
							booking.booking.paymentStatus === 'paid'
								? 'default'
								: booking.booking.paymentStatus === 'failed'
									? 'destructive'
									: 'secondary'
						}
						className="text-sm"
					>
						{booking.booking.paymentStatus.toUpperCase()}
					</Badge>
				</div>
			</div>

			<div className="grid lg:grid-cols-3 gap-8">
				{/* Left Column - Booking Details */}
				<div className="lg:col-span-2 space-y-6">
					{/* Customer Information */}
					<Card>
						<CardHeader>
							<CardTitle>Customer Information</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid sm:grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Guest Name
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
							<div className="grid sm:grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Account Email
									</p>
									<p className="font-semibold">
										{(booking as typeof booking & { user?: { email: string } })
											.user?.email || 'N/A'}
									</p>
								</div>
								{booking.booking.guestPhone && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Phone
										</p>
										<p className="font-semibold">
											{booking.booking.guestPhone}
										</p>
									</div>
								)}
							</div>
							{booking.booking.specialRequests && (
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Special Requests
									</p>
									<p className="text-sm bg-muted p-3 rounded-md">
										{booking.booking.specialRequests}
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Booking Details */}
					<Card>
						<CardHeader>
							<CardTitle>Booking Details</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid sm:grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Confirmation ID
									</p>
									<Badge
										variant="secondary"
										className="font-semibold font-mono tracking-wider text-lg"
									>
										{booking.booking.confirmationId}
									</Badge>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Room
									</p>
									<p className="font-semibold">{booking.room.name}</p>
								</div>
							</div>

							<div className="grid sm:grid-cols-2 gap-4">
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
									<p className="text-sm text-muted-foreground">After 3:00 PM</p>
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
										Before 11:00 AM
									</p>
								</div>
							</div>

							<div className="grid sm:grid-cols-2 gap-4">
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
							</div>
						</CardContent>
					</Card>

					{/* Internal Notes  */}
					<Card>
						<CardHeader>
							<CardTitle>Internal Notes</CardTitle>
							<CardDescription>
								Add or edit internal notes for this booking. These notes are
								only visible to admin users and not shown to the guest.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<BookingInternalNotes
								bookingId={booking.booking.id}
								currentNotes={booking.booking.internalNotes || ''}
							/>
						</CardContent>
					</Card>

					{/* Admin Information */}
					<Card>
						<CardHeader>
							<CardTitle>Admin Information</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid sm:grid-cols-2 gap-4">
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
									<p className="font-mono text-sm">{booking.booking.userId}</p>
								</div>
							</div>
							<div className="grid sm:grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Created At
									</p>
									<p className="text-sm">
										{new Date(booking.booking.createdAt).toLocaleString()}
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Updated At
									</p>
									<p className="text-sm">
										{new Date(booking.booking.updatedAt).toLocaleString()}
									</p>
								</div>
							</div>
							<div className="grid sm:grid-cols-2 gap-4">
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
				</div>{' '}
				{/* Right Column - Pricing Summary & Actions */}
				<div className="lg:col-span-1">
					<Card className="sticky top-4">
						<CardHeader>
							<CardTitle>Pricing Summary</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm">
										$
										{(
											booking.booking.baseAmount /
											booking.booking.numberOfNights
										).toFixed(2)}{' '}
										x {booking.booking.numberOfNights} night
										{booking.booking.numberOfNights !== 1 ? 's' : ''}
									</span>
									<span className="font-medium">
										${booking.booking.baseAmount.toFixed(2)}
									</span>
								</div>

								{booking.booking.feesAmount &&
									booking.booking.feesAmount > 0 && (
										<div className="flex justify-between items-center">
											<span className="text-sm">Service Fee</span>
											<span className="font-medium">
												${booking.booking.feesAmount.toFixed(2)}
											</span>
										</div>
									)}

								{booking.booking.taxAmount && booking.booking.taxAmount > 0 && (
									<div className="flex justify-between items-center">
										<span className="text-sm">Taxes</span>
										<span className="font-medium">
											${booking.booking.taxAmount.toFixed(2)}
										</span>
									</div>
								)}
							</div>

							<div className="border-t pt-3">
								<div className="flex justify-between items-center">
									<span className="font-semibold">Total</span>
									<span className="font-bold text-lg">
										${booking.booking.totalAmount.toFixed(2)}
									</span>
								</div>
							</div>

							{/* Payment Status */}
							<div className="border-t pt-3">
								<div className="flex justify-between items-center">
									<span className="text-sm font-medium">Payment Status</span>
									<Badge
										variant={
											booking.booking.paymentStatus === 'paid'
												? 'default'
												: booking.booking.paymentStatus === 'failed'
													? 'destructive'
													: 'secondary'
										}
									>
										{booking.booking.paymentStatus.toUpperCase()}
									</Badge>
								</div>
							</div>

							{/* Admin Action Buttons */}
							<div className="border-t pt-4 space-y-3">
								{booking.booking.stripePaymentIntentId && (
									<Button className="w-full" asChild>
										<a
											href={`https://dashboard.stripe.com/acct_1RwOD0B1s28979kR/payments/${booking.booking.stripePaymentIntentId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center"
										>
											<Icon icon="tabler:external-link" />
											View Payment at Stripe
										</a>
									</Button>
								)}
								<Button
									onClick={handleResendEmail}
									disabled={isResendingEmail}
									variant="secondary"
									className="w-full"
								>
									<Icon icon="tabler:mail" />
									{isResendingEmail
										? 'Sending...'
										: 'Resend Confirmation Email'}
								</Button>
								<Button variant="destructive" className="w-full">
									<Icon icon="tabler:circle-x" />
									Cancel Booking
								</Button>
								<p className="bg-destructive uppercase">
									The cancellation policy and process needs to be implemented.
									Button does not work yet.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</AdminLayout>
	);
}
