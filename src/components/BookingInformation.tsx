import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BookingInformationProps {
	selectedDateRange: DateRange | undefined;
	totalPrice: number;
	nights: number;
	onBookNow: () => void;
	roomName: string;
	className?: string;
}

export default function BookingInformation({
	selectedDateRange,
	totalPrice,
	nights,
	onBookNow,
	roomName,
	className = '',
}: BookingInformationProps) {
	const formatDate = (date: Date) => {
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	};

	const renderDateDisplay = () => {
		if (!selectedDateRange?.from || !selectedDateRange?.to) return null;

		return (
			<div className="space-y-2">
				<p className="font-semibold">
					Check-in: {formatDate(selectedDateRange.from)}
				</p>
				<p className="font-semibold">
					Check-out: {formatDate(selectedDateRange.to)}
				</p>
			</div>
		);
	};

	const renderPricingBreakdown = () => {
		return (
			<div className="mt-4 p-4 bg-muted/50 rounded-md space-y-2 border">
				<div className="flex justify-between items-center">
					<span className="font-semibold">
						Room Rate for {nights} night{nights !== 1 ? 's' : ''}
					</span>
					<span className="font-semibold">${totalPrice.toFixed(2)}</span>
				</div>
				<p className="text-sm text-muted-foreground">
					Base rate: ${nights > 0 ? (totalPrice / nights).toFixed(2) : '0'}
					/night
				</p>
				<p className="text-xs text-muted-foreground">
					*Room rate only - fees and taxes added at checkout
				</p>
			</div>
		);
	};

	const renderEmptyState = () => {
		return (
			<div className="text-center py-8">
				<CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
				<p className="text-muted-foreground">
					Select your check-in and check-out dates to see pricing and
					availability
				</p>
				<p className="text-sm text-muted-foreground mt-2">
					Minimum stay: 1 night • Maximum stay: 30 nights
				</p>
			</div>
		);
	};

	return (
		<div className={`space-y-6 ${className}`}>
			<Card className="border-border">
				<CardHeader>
					<CardTitle className="text-foreground">Booking Information</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{selectedDateRange?.from && selectedDateRange?.to ? (
						<div>
							<p className="text-sm text-muted-foreground mb-2">
								Selected Dates:
							</p>
							{renderDateDisplay()}
							{renderPricingBreakdown()}
						</div>
					) : (
						renderEmptyState()
					)}
				</CardContent>
			</Card>

			{selectedDateRange?.from && selectedDateRange?.to && (
				<Card className="border-border bg-background">
					<CardContent className="p-6">
						<h4 className="font-semibold text-foreground mb-2">
							Ready to book your stay?
						</h4>
						<p className="text-sm text-muted-foreground mb-4">
							Continue with your reservation for {nights} night
							{nights !== 1 ? 's' : ''} at the {roomName}
						</p>
						<Button className="w-full" onClick={onBookNow}>
							Book Now - ${totalPrice.toFixed(2)} for {nights} night
							{nights !== 1 ? 's' : ''}
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
