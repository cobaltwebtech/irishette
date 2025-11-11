import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/integrations/tanstack-query/root-provider';
import { bookingActions } from '@/stores';
import { requireAuth } from '@/utils/auth-check';
import { parseISODateString } from '@/utils/booking-utils';

export const Route = createFileRoute('/booking/confirmation/$bookingId')({
	head: () => ({
		meta: [
			{
				title: 'Booking Confirmed | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check the user is authenticated before rendering the page
		const session = await requireAuth(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	component: BookingConfirmation,
});

function BookingConfirmation() {
	const { bookingId } = Route.useParams();
	const navigate = useNavigate();

	// Fetch fresh booking data from database
	const {
		data: bookingData,
		isLoading,
		error,
	} = useQuery(
		trpc.bookings.getBooking.queryOptions(
			{ bookingId },
			{
				staleTime: 0, // Always fetch fresh data
				refetchOnWindowFocus: false,
			},
		),
	);

	// Clear the booking store when component mounts
	useEffect(() => {
		bookingActions.reset();
	}, []);

	// Handle loading state
	if (isLoading) {
		return (
			<div className="container mx-auto max-w-4xl px-4 py-12">
				<Card>
					<CardContent className="py-12">
						<div className="text-center space-y-4">
							<Icon
								icon="tabler:loader-2"
								className="size-8 animate-spin mx-auto text-primary"
							/>
							<p className="text-muted-foreground">Loading confirmation...</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Handle error state
	if (error || !bookingData?.booking) {
		return (
			<div className="container mx-auto max-w-4xl px-4 py-12">
				<Card>
					<CardContent className="py-12">
						<div className="text-center space-y-4">
							<Icon
								icon="tabler:alert-circle"
								className="size-8 text-destructive mx-auto"
							/>
							<h3 className="text-2xl text-destructive font-bold">
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

	const { booking, room: roomData } = bookingData;

	// Calculate number of nights
	const checkIn = parseISODateString(booking.checkInDate);
	const checkOut = parseISODateString(booking.checkOutDate);
	const nights = Math.ceil(
		(checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
	);

	return (
		<section>
			<div className="bg-muted border-b">
				<div className="container mx-auto px-4 py-6 text-center space-y-1">
					<p className="animate-bounce text-4xl">🎉</p>
					<div className="flex items-center justify-center gap-2">
						<Icon
							icon="tabler:circle-check-filled"
							className="size-8 text-primary"
						/>
						<h1 className="text-2xl font-bold text-foreground">
							Your Booking is Confirmed!
						</h1>
					</div>
					<p>
						You will receive a confirmation email shortly with all the details.
					</p>
					<p>
						We look forward to seeing you on{' '}
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
				<div className="grid lg:grid-cols-6 gap-8">
					{/* Left Column - Booking Details */}
					<Card className="lg:col-span-4">
						<CardHeader>
							<CardTitle>Booking Details</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid sm:grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Confirmation ID
									</p>
									<Badge
										variant="secondary"
										className="font-semibold font-mono tracking-wider text-lg"
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
									<p className="text-sm text-muted-foreground">After 3:00 PM</p>
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
										Before 11:00 AM
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
								<p className="text-lg font-semibold">Total Paid</p>
								<p className="text-lg font-semibold text-right">
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
							<div className="grid sm:grid-cols-2 gap-4">
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
							<div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
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
					{/* Right Column - Address and Directions */}
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Our Address and Directions</CardTitle>
						</CardHeader>
						<CardContent>ADD ADDRESS AND DIRECTIONS HERE</CardContent>
					</Card>
				</div>
				{/* Action Buttons */}
				<div className="mx-auto max-w-lg flex flex-wrap gap-4 pt-8">
					<Button asChild variant="secondary" className="flex-1">
						<Link to="/">
							<Icon icon="tabler:home" className="size-5" />
							Go to Home
						</Link>
					</Button>
					<Button asChild className="flex-1">
						<Link to="/account">
							<Icon
								icon="material-symbols:bed-outline-rounded"
								className="size-5"
							/>
							View All Bookings
						</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
