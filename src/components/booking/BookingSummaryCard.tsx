import { Icon } from '@iconify/react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookingStore } from '@/stores';
import { parseISODateString } from '@/utils/booking-utils';

export function BookingSummaryCard() {
	const booking = useBookingStore();
	const summary = booking.summary;
	const navigate = useNavigate();

	const handleNavigateToRooms = () => {
		navigate({ to: '/' }).then(() => {
			// Wait a brief moment for the page to render
			setTimeout(() => {
				const roomsSection = document.querySelector('[data-rooms-section]');
				if (roomsSection) {
					roomsSection.scrollIntoView({ behavior: 'smooth' });
				}
			}, 100);
		});
	};

	if (!summary) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Booking Summary</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-muted-foreground">
						You have no active booking started yet.
					</p>
					<p className="text-muted-foreground">
						You can start a new booking by viewing our available rooms.
					</p>
					<Button onClick={handleNavigateToRooms}>
						<Icon icon="tabler:home-search" />
						Book a Stay
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="sticky top-24">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:list-details" className="size-6" />
					Booking Details
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Room */}
				<div>
					<h4 className="font-semibold capitalize">{summary.roomName}</h4>
					<p className="text-sm text-muted-foreground">
						{summary.guestCount} guest{summary.guestCount !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Dates */}
				<div>
					<h4 className="font-semibold">Dates</h4>
					<p className="text-sm text-muted-foreground">
						Check-in:{' '}
						{parseISODateString(summary.checkInDate).toLocaleDateString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Check-out:{' '}
						{parseISODateString(summary.checkOutDate).toLocaleDateString()}
					</p>
					<p className="text-sm text-muted-foreground">
						{summary.totalNights} night{summary.totalNights !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Pricing - Use reactive booking.pricing instead of computed summary.pricing */}
				{booking.pricing && (
					<div className="border-t pt-4">
						<div className="flex items-center justify-between mb-2">
							<h4 className="font-semibold">Pricing Breakdown</h4>
							{booking.currentStep !== 'payment' &&
								booking.currentStep !== 'confirmation' && (
									<span className="text-xs text-muted-foreground">
										Estimated
									</span>
								)}
						</div>
						<div className="space-y-1 text-sm">
							<div className="flex justify-between">
								<span>
									${booking.pricing.basePrice?.toFixed(2) || '0.00'} ×{' '}
									{summary.totalNights} nights
								</span>
								<span>${booking.pricing.subtotal?.toFixed(2) || '0.00'}</span>
							</div>

							{(booking.pricing.fees ?? 0) > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Service Fee</span>
									<span>${booking.pricing.fees.toFixed(2)}</span>
								</div>
							)}

							{/* Enhanced tax display */}
							{(booking.pricing.taxes ?? 0) > 0 && (
								<div className="space-y-1">
									<div className="flex justify-between text-muted-foreground">
										<span>Hotel Occupancy Tax</span>
										<span>${booking.pricing.taxes.toFixed(2)}</span>
									</div>
									{booking.pricing.taxBreakdown && (
										<div className="ml-2 space-y-1 text-xs text-muted-foreground">
											<div className="flex justify-between">
												<span>
													• State of Texas (
													{(
														booking.pricing.taxBreakdown.stateTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{booking.pricing.taxBreakdown.stateTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
											<div className="flex justify-between">
												<span>
													• City of Dublin (
													{(
														booking.pricing.taxBreakdown.cityTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{booking.pricing.taxBreakdown.cityTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
										</div>
									)}
								</div>
							)}

							<div className="flex justify-between font-semibold border-t pt-2 mt-2 text-base">
								<span>Total Due (USD)</span>
								<span>
									${booking.pricing.totalAmount?.toFixed(2) || '0.00'}
								</span>
							</div>
						</div>
					</div>
				)}

				{/* Guest Info */}
				{booking.guestInfo && (
					<div className="border-t pt-4">
						<h4 className="font-semibold mb-2">Guest Information</h4>
						<div className="space-y-1 text-sm">
							<p>{booking.guestInfo.name}</p>
							<p className="text-muted-foreground">{booking.guestInfo.email}</p>
							{booking.guestInfo.phone && (
								<p className="text-muted-foreground">
									{booking.guestInfo.phone}
								</p>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
