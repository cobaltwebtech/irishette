import { Icon } from '@iconify/react';
import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookingStore } from '@/stores';
import { formatStayDate } from '@/utils/timezone';

/** One tax in the breakdown; hidden when that tax is 0 for the room. */
function TaxBreakdownLine({
	label,
	rate,
	amount,
}: {
	label: string;
	rate: number;
	amount: number;
}) {
	if (amount <= 0) return null;
	return (
		<div className="flex justify-between">
			<span>
				• {label} ({Number((rate * 100).toFixed(2))}%)
			</span>
			<span>${amount.toFixed(2)}</span>
		</div>
	);
}

export function BookingSummaryCard() {
	const booking = useBookingStore();
	const summary = booking.summary;
	const navigate = useNavigate();

	const handleNavigateToRooms = () => {
		void navigate({ to: '/' }).then(() => {
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
						Check-in: {formatStayDate(summary.checkInDate)}
					</p>
					<p className="text-sm text-muted-foreground">
						Check-out: {formatStayDate(summary.checkOutDate)}
					</p>
					<p className="text-sm text-muted-foreground">
						{summary.totalNights} night{summary.totalNights !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Pricing - Use reactive booking.pricing instead of computed summary.pricing */}
				{booking.pricing && (
					<div className="border-t pt-4">
						<div className="mb-2 flex items-center justify-between">
							<h4 className="font-semibold">Pricing Breakdown</h4>
							{booking.currentStep !== 'payment' && (
								<span className="text-xs text-muted-foreground">Estimated</span>
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
										<span>Hotel Occupancy Tax (room + service fee)</span>
										<span>${booking.pricing.taxes.toFixed(2)}</span>
									</div>
									{booking.pricing.taxBreakdown && (
										<div className="ml-2 space-y-1 text-xs text-muted-foreground">
											<TaxBreakdownLine
												label="State of Texas"
												rate={booking.pricing.taxBreakdown.stateTaxRate}
												amount={booking.pricing.taxBreakdown.stateTaxAmount}
											/>
											<TaxBreakdownLine
												label="City of Dublin"
												rate={booking.pricing.taxBreakdown.cityTaxRate}
												amount={booking.pricing.taxBreakdown.cityTaxAmount}
											/>
										</div>
									)}
								</div>
							)}

							<div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
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
						<h4 className="mb-2 font-semibold">Guest Information</h4>
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
