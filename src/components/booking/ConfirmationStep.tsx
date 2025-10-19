import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useBookingStore } from '@/stores';
import { parseISODateString } from '@/utils/booking-utils';

export function ConfirmationStep() {
	const booking = useBookingStore();
	const summary = booking.summary;
	const [confirmationId, setConfirmationId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch booking details to get confirmation ID
	useEffect(() => {
		const fetchBookingDetails = async () => {
			if (!booking.bookingId) {
				setIsLoading(false);
				return;
			}

			try {
				const result = await trpcClient.bookings.getBooking.query({
					bookingId: booking.bookingId,
				});

				if (result?.booking?.confirmationId) {
					setConfirmationId(result.booking.confirmationId);
				}
			} catch (error) {
				console.error('Failed to fetch booking details:', error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchBookingDetails();
	}, [booking.bookingId]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Check className="w-5 h-5 text-green-600" />
					Booking Confirmed!
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="bg-green-50 border border-green-200 rounded-lg p-4">
					<p className="text-green-800 font-medium">
						🎉 Your reservation has been confirmed!
					</p>
					<p className="text-green-700 text-sm mt-1">
						You'll receive a confirmation email shortly with all the details.
					</p>
				</div>

				{summary && (
					<div className="space-y-4">
						{/* Booking Details */}
						<div>
							<h3 className="font-semibold text-lg mb-3">
								Reservation Details
							</h3>

							<div className="grid gap-3">
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
										{summary.roomSlug.replace('-', ' ')}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-in:</span>
									<span className="font-medium">
										{parseISODateString(summary.checkInDate).toLocaleDateString(
											'en-US',
											{
												weekday: 'long',
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
											weekday: 'long',
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
							<div className="border-t pt-4">
								<h4 className="font-semibold mb-3">Guest Information</h4>
								<div className="grid gap-2">
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
							<div className="border-t pt-4">
								<h4 className="font-semibold mb-3">Payment Summary</h4>
								<div className="grid gap-2">
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
									<div className="flex justify-between font-semibold text-lg border-t pt-2">
										<span>Total Paid:</span>
										<span>${summary.pricing.totalAmount.toFixed(2)}</span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Next Steps */}
				<div className="border-t pt-4">
					<h4 className="font-semibold mb-3">What's Next?</h4>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li>• Check your email for the confirmation details</li>
						<li>• Save this confirmation for your records</li>
						<li>• Contact us if you have any questions</li>
						<li>• We look forward to hosting you!</li>
					</ul>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-4 pt-4">
					<Button
						onClick={() => booking.actions.reset()}
						variant="outline"
						className="flex-1"
					>
						New Booking
					</Button>
					<Link to="/" className="flex-1">
						<Button className="w-full">Back to Home</Button>
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
