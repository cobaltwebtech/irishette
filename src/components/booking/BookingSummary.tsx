import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookingStore } from '@/stores';
import { parseISODateString } from '@/utils/booking-utils';

export function BookingSummary() {
	const booking = useBookingStore();
	const summary = booking.summary;

	if (!summary) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Booking Summary</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">
						No booking information available.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="sticky top-4">
			<CardHeader>
				<CardTitle>Booking Summary</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Room */}
				<div>
					<h4 className="font-semibold capitalize">
						{summary.roomSlug.replace('-', ' ')}
					</h4>
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

				{/* Pricing */}
				{summary.pricing && (
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
									${summary.pricing.basePrice?.toFixed(2) || '0.00'} ×{' '}
									{summary.totalNights} nights
								</span>
								<span>${summary.pricing.subtotal?.toFixed(2) || '0.00'}</span>
							</div>

							{summary.pricing.fees && summary.pricing.fees > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Service Fee</span>
									<span>${summary.pricing.fees.toFixed(2)}</span>
								</div>
							)}

							{/* Enhanced tax display */}
							{summary.pricing.taxes && summary.pricing.taxes > 0 && (
								<div className="space-y-1">
									<div className="flex justify-between text-muted-foreground">
										<span>Hotel Occupancy Tax</span>
										<span>${summary.pricing.taxes.toFixed(2)}</span>
									</div>
									{summary.pricing.taxBreakdown && (
										<div className="ml-2 space-y-1 text-xs text-muted-foreground">
											<div className="flex justify-between">
												<span>
													• State of Texas (
													{(
														summary.pricing.taxBreakdown.stateTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{summary.pricing.taxBreakdown.stateTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
											<div className="flex justify-between">
												<span>
													• City of Dublin (
													{(
														summary.pricing.taxBreakdown.cityTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{summary.pricing.taxBreakdown.cityTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
										</div>
									)}
								</div>
							)}

							<div className="flex justify-between font-semibold border-t pt-2 mt-2 text-base">
								<span>Total</span>
								<span>
									${summary.pricing.totalAmount?.toFixed(2) || '0.00'}
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
