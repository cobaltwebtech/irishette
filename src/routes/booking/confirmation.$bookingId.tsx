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
		<div className="container mx-auto max-w-2xl px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Icon
							icon="tabler:circle-check-filled"
							className="size-8 text-primary"
						/>
						Booking Confirmed!
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="bg-secondary border border-border rounded-lg px-4 py-6 space-y-2 text-center">
						<p className="animate-bounce text-4xl">🎉</p>
						<p className="font-bold">Your booking has been confirmed!</p>
						<p className="text-sm">
							You will receive a confirmation email shortly with all the
							details.
						</p>
					</div>

					{/* Booking Details */}
					<div className="space-y-8">
						<div className="border-b pb-4">
							<h3 className="font-semibold mb-3">Booking Details</h3>

							<div className="flex flex-col gap-3">
								<div className="flex justify-between">
									<span className="text-muted-foreground">
										Confirmation ID:
									</span>
									<Badge
										variant="outline"
										className="font-bold font-mono text-sm tracking-wider"
									>
										{booking.confirmationId}
									</Badge>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Room:</span>
									<span className="font-medium capitalize">
										{roomData?.name ?? 'Unknown Room'}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-in:</span>
									<span className="font-medium">
										{checkIn.toLocaleDateString('en-US', {
											weekday: 'short',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-out:</span>
									<span className="font-medium">
										{checkOut.toLocaleDateString('en-US', {
											weekday: 'short',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Duration:</span>
									<span className="font-medium">
										{nights} night{nights !== 1 ? 's' : ''}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Guests:</span>
									<span className="font-medium">
										{booking.numberOfGuests} guest
										{booking.numberOfGuests !== 1 ? 's' : ''}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Status:</span>
									<Badge variant="default" className="capitalize">
										{booking.status}
									</Badge>
								</div>
							</div>
						</div>

						{/* Guest Information */}
						<div className="border-b pb-4">
							<h4 className="font-semibold mb-3">Guest Information</h4>
							<div className="flex flex-col gap-2">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Name:</span>
									<span className="font-medium">{booking.guestName}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Email:</span>
									<span className="font-medium">{booking.guestEmail}</span>
								</div>
								{booking.guestPhone && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Phone:</span>
										<span className="font-medium">{booking.guestPhone}</span>
									</div>
								)}
								{booking.specialRequests && (
									<div className="flex flex-col gap-1">
										<span className="text-muted-foreground">
											Special Requests:
										</span>
										<span className="font-medium text-sm">
											{booking.specialRequests}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Pricing Summary */}
						<div className="border-b pb-4">
							<h4 className="font-semibold mb-3">Payment Summary</h4>
							<div className="flex flex-col gap-2">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Base Rate:</span>
									<span>${(booking.baseAmount / nights).toFixed(2)}/night</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Subtotal:</span>
									<span>${booking.baseAmount.toFixed(2)}</span>
								</div>
								{booking.feesAmount !== null && booking.feesAmount > 0 && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Fees:</span>
										<span>${booking.feesAmount.toFixed(2)}</span>
									</div>
								)}
								{booking.taxAmount !== null && booking.taxAmount > 0 && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Taxes:</span>
										<span>${booking.taxAmount.toFixed(2)}</span>
									</div>
								)}
								<div className="flex justify-between font-semibold text-lg">
									<span>Total Paid:</span>
									<span>${booking.totalAmount.toFixed(2)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Payment Status:</span>
									<Badge
										variant={
											booking.paymentStatus === 'paid' ? 'default' : 'secondary'
										}
										className="capitalize"
									>
										{booking.paymentStatus}
									</Badge>
								</div>
							</div>
						</div>

						{/* Booking Timeline */}
						{booking.confirmedAt && (
							<div className="border-b pb-4">
								<h4 className="font-semibold mb-3">Booking Timeline</h4>
								<div className="flex flex-col gap-2 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">
											Booking Created:
										</span>
										<span>
											{new Date(booking.createdAt).toLocaleString('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											})}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">
											Payment Confirmed:
										</span>
										<span>
											{new Date(booking.confirmedAt).toLocaleString('en-US', {
												dateStyle: 'medium',
												timeStyle: 'short',
											})}
										</span>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Next Steps */}
					<div className="border-b pb-4">
						<h4 className="font-semibold mb-3">What's Next?</h4>
						<ul className="space-y-2 text-sm text-muted-foreground list-disc ml-4">
							<li>Check your email for the confirmation details</li>
							<li>Save this confirmation for your records</li>
							<li>
								<Link to="/contact" className="text-accent hover:underline">
									Contact us
								</Link>{' '}
								if you have any questions or need to make changes to your
								booking
							</li>
							<li>We look forward to hosting you!</li>
						</ul>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-4 pt-4">
						<Button asChild variant="secondary" className="flex-1">
							<Link to="/">
								<Icon icon="tabler:home" className="size-5" />
								Back to Home
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
				</CardContent>
			</Card>
		</div>
	);
}
