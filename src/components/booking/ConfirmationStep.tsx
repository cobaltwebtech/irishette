import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/integrations/tanstack-query/root-provider';
import { useBookingStore } from '@/stores';
import { parseISODateString } from '@/utils/booking-utils';

export function ConfirmationStep() {
	const booking = useBookingStore();
	const summary = booking.summary;

	// Fetch booking details to get confirmation ID using useQuery
	const { data: bookingData, isLoading } = useQuery(
		trpc.bookings.getBooking.queryOptions(
			{ bookingId: booking.bookingId || '' },
			{
				enabled: !!booking.bookingId,
				staleTime: 5 * 60 * 1000, // Cache for 5 minutes
				refetchOnWindowFocus: false,
			},
		),
	);

	const confirmationId = bookingData?.booking?.confirmationId;

	return (
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
					<p className="font-bold">Your reservation has been confirmed!</p>
					<p className="text-sm">
						You will receive a confirmation email shortly with all the details.
					</p>
				</div>

				{/* Booking Details */}
				{summary && (
					<div className="space-y-8">
						<div className="border-b pb-4">
							<h3 className="font-semibold mb-3">Reservation Details</h3>

							<div className="flex flex-col gap-3">
								{confirmationId && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">
											Confirmation ID:
										</span>
										<Badge
											variant="outline"
											className="font-bold font-mono text-sm tracking-wider"
										>
											{isLoading ? '...' : confirmationId}
										</Badge>
									</div>
								)}

								<div className="flex justify-between">
									<span className="text-muted-foreground">Room:</span>
									<span className="font-medium capitalize">
										{summary.roomName ?? 'Unknown Room'}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-in:</span>
									<span className="font-medium">
										{parseISODateString(summary.checkInDate).toLocaleDateString(
											'en-US',
											{
												weekday: 'short',
												year: 'numeric',
												month: 'long',
												day: 'numeric',
											},
										)}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-out:</span>
									<span className="font-medium">
										{parseISODateString(
											summary.checkOutDate,
										).toLocaleDateString('en-US', {
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
										{summary.totalNights} night
										{summary.totalNights !== 1 ? 's' : ''}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Guests:</span>
									<span className="font-medium">
										{summary.guestCount} guest
										{summary.guestCount !== 1 ? 's' : ''}
									</span>
								</div>
							</div>
						</div>

						{/* Guest Information */}
						{booking.guestInfo && (
							<div className="border-b pb-4">
								<h4 className="font-semibold mb-3">Guest Information</h4>
								<div className="flex flex-col gap-2">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Name:</span>
										<span className="font-medium">
											{booking.guestInfo.name}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Email:</span>
										<span className="font-medium">
											{booking.guestInfo.email}
										</span>
									</div>
									{booking.guestInfo.phone && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Phone:</span>
											<span className="font-medium">
												{booking.guestInfo.phone}
											</span>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Pricing Summary */}
						{summary.pricing && (
							<div className="border-b pb-4">
								<h4 className="font-semibold mb-3">Payment Summary</h4>
								<div className="flex flex-col gap-2">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Base Rate:</span>
										<span>${summary.pricing.basePrice.toFixed(2)}/night</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Subtotal:</span>
										<span>${summary.pricing.subtotal.toFixed(2)}</span>
									</div>
									{summary.pricing.fees > 0 && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Fees:</span>
											<span>${summary.pricing.fees.toFixed(2)}</span>
										</div>
									)}
									{summary.pricing.taxes > 0 && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Taxes:</span>
											<span>${summary.pricing.taxes.toFixed(2)}</span>
										</div>
									)}
									<div className="flex justify-between font-semibold text-lg">
										<span>Total Paid:</span>
										<span>${summary.pricing.totalAmount.toFixed(2)}</span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

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
							if you have any questions or need to make changes to your booking
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
							View Bookings
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
