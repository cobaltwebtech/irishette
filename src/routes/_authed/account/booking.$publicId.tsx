import { Icon } from '@iconify/react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { CancelBookingButton } from '@/components/booking/CancelBookingButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';

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
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center gap-4">
						<Link
							to="/account"
							className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
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
						<p className="text-muted-foreground mb-4">
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

	const { data: booking } = useSuspenseQuery(
		trpc.bookings.getBooking.queryOptions({ publicId }),
	);

	const resendEmail = useMutation(
		trpc.bookings.resendConfirmationEmail.mutationOptions({
			onSuccess: (result) => {
				toast.success('Email sent successfully!', {
					description:
						result.message ||
						'Confirmation email has been sent to your email address.',
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

	// Handle resending confirmation email
	const handleResendEmail = () => {
		resendEmail.mutate({ bookingId: booking.booking.id });
	};

	// Final safety check - should not be needed but prevents runtime errors
	if (!booking?.booking || !booking.room) {
		return (
			<div className="flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading booking details...</p>
				</div>
			</div>
		);
	}

	return (
		<section>
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Button asChild>
							<Link to="/account">← Back to Account</Link>
						</Button>
						<h1 className="text-2xl font-bold text-foreground">
							Booking Details
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
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid lg:grid-cols-6 gap-8">
					{/* Left Column - Booking Details */}
					<Card className="lg:col-span-4">
						<CardHeader>
							<CardTitle>Stay Details</CardTitle>
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
								<p className="text-sm font-medium text-muted-foreground">
									Room
								</p>
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
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								Guest Information
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
							{booking.booking.guestPhone && (
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Phone
									</p>
									<p className="font-semibold">{booking.booking.guestPhone}</p>
								</div>
							)}
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
					{/* Middle Column - Special Requests */}
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Special Requests</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
								{booking.booking.specialRequests ||
									'No special requests provided'}
							</div>
						</CardContent>
					</Card>
					{/* Right Column - Action Buttons */}
					<Card className="lg:col-span-2 lg:row-span-2">
						<CardHeader>
							<CardTitle>Booking Actions</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<Button
								onClick={handleResendEmail}
								disabled={isResendingEmail}
								variant="outline"
								className="w-full"
							>
								<Icon icon="tabler:mail-forward" className="size-6" />
								{isResendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
							</Button>
							<Button className="w-full" variant="secondary">
								<Icon icon="tabler:message-circle" className="size-6" />
								Contact Support
							</Button>
							{booking.booking.status !== 'cancelled' && (
								<CancelBookingButton
									publicId={booking.booking.publicId}
									mode="guest"
								/>
							)}
						</CardContent>
						<CardFooter>
							Can add link for Google and Apple Maps directions here later on.
						</CardFooter>
					</Card>

					{/* Important Information Card */}
					<Card className="lg:col-span-4">
						<CardHeader>
							<CardTitle>Important Information</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="mx-4 list-disc text-sm text-muted-foreground space-y-2">
								<li>Check your email for the booking confirmation details</li>
								<li>
									Check-in is available from 3:00 PM. Early check-in may be
									available upon request.
								</li>
								<li>
									Check-out is by 11:00 AM. Late check-out may be available upon
									request.
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
								<li className="font-bold text-lg bg-red-200">
									DO WE NEED ADDITIONAL INSTRUCTIONS FOR THE CUSTOMER?
								</li>
							</ul>
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}
