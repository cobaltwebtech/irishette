import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { BookingInternalNotes } from '@/components/admin/BookingInternalNotes';
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
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
import { requireAdmin } from '@/utils/auth-check';

export const Route = createFileRoute('/admin/bookings/$bookingId')({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check user is authenticated and has admin role
		const session = await requireAdmin(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	component: AdminBookingDetailPage,
});

function AdminBookingDetailPage() {
	const params = Route.useParams() as { bookingId: string };
	const bookingId = params.bookingId;
	const [isResendingEmail, setIsResendingEmail] = useState(false);

	// Use tRPC query to fetch booking details (admin version)
	const {
		data: booking,
		isLoading,
		error,
	} = useQuery(
		trpc.bookings.getBooking.queryOptions(
			{
				bookingId: bookingId,
			},
			{
				enabled: !!bookingId,
				retry: false,
				staleTime: 5 * 60 * 1000,
			},
		),
	);

	// Fetch guest details to get booking count for repeat guest badge
	const { data: guestData, isLoading: isLoadingGuestData } = useQuery(
		trpc.users.adminGetGuestDetails.queryOptions(
			{
				userId: booking?.booking?.userId || '',
			},
			{
				enabled: !!booking?.booking?.userId,
				retry: false,
				staleTime: 5 * 60 * 1000,
			},
		),
	);

	// Handle resending confirmation email (admin can resend for any booking)
	const handleResendEmail = async () => {
		if (!booking?.booking) return;

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

	// Early return for loading state
	if (isLoading || !booking || !booking.booking || !booking.room) {
		return null;
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
			<div className="grid lg:grid-cols-6 gap-8">
				{/* Left Column - Booking Details */}
				<Card className="lg:col-span-4">
					<CardHeader>
						<CardTitle>Booking Details</CardTitle>
					</CardHeader>
					<CardContent className="grid sm:grid-cols-2 gap-4">
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
							<p className="text-sm text-muted-foreground">Before 11:00 AM</p>
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
							<p className="text-lg font-semibold text-right">
								${booking.booking.totalAmount.toFixed(2)}
							</p>
						</div>
					</CardContent>
					<CardFooter className="border-t grid grid-cols-2 ">
						<p className="text-sm font-medium text-muted-foreground">
							Payment Status
						</p>
						<p className="text-right">
							<Badge
								variant={
									booking.booking.paymentStatus === 'paid'
										? 'default'
										: booking.booking.paymentStatus === 'failed'
											? 'destructive'
											: booking.booking.paymentStatus === 'refunded'
												? 'secondary'
												: 'outline'
								}
							>
								{booking.booking.paymentStatus.toUpperCase()}
							</Badge>
						</p>
					</CardFooter>
				</Card>

				{/* Left Column - Guest Information */}
				<Card className="lg:col-span-4">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Guest Information
							{!isLoadingGuestData && bookingCount > 1 && (
								<Badge className="text-xs bg-accent-4">
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
						<div className="grid sm:grid-cols-2 gap-4">
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
							<Button className="w-full h-auto" asChild>
								<a
									href={`https://dashboard.stripe.com/acct_1RwOD0B1s28979kR/payments/${booking.booking.stripePaymentIntentId}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center"
								>
									<Icon icon="tabler:external-link" className="size-6" />
									<span className="text-wrap text-center">
										View Payment at Stripe
									</span>
								</a>
							</Button>
						)}
						<Button
							onClick={handleResendEmail}
							disabled={isResendingEmail}
							variant="secondary"
							className="w-full h-auto"
						>
							<Icon icon="tabler:mail-forward" className="size-6" />
							<span className="text-wrap">
								{isResendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
							</span>
						</Button>
						<Button variant="destructive" className="w-full">
							<Icon icon="tabler:circle-x" className="size-6" />
							Cancel Booking
						</Button>
						<p className="bg-destructive uppercase">
							The cancellation policy and process needs to be implemented.
							Button does not work yet.
						</p>
					</CardContent>
				</Card>

				{/* Left Column - Special Requests */}
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Special Requests</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
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

				{/* Admin Information */}
				<Card className="lg:col-span-full">
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
			</div>
		</AdminLayout>
	);
}
