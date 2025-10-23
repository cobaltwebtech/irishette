import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

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
			weekday: 'short',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	};

	const renderDateDisplay = () => {
		if (!selectedDateRange?.from || !selectedDateRange?.to) return null;

		return (
			<div className="space-y-2">
				<p>
					<span className="underline">Check In</span> <br />
					<span className="font-semibold">
						{formatDate(selectedDateRange.from)}
					</span>
				</p>
				<p>
					<span className="underline">Check Out</span> <br />
					<span className="font-semibold">
						{formatDate(selectedDateRange.to)}
					</span>
				</p>
			</div>
		);
	};

	const renderPricingBreakdown = () => {
		return (
			<div className="mt-4 p-4 bg-muted/50 rounded-md space-y-2 border">
				<div className="flex justify-between items-center">
					<span className="font-semibold">
						Room Rate for {nights} night{nights !== 1 ? 's' : ''}*
					</span>
					<span className="font-semibold">${totalPrice.toFixed(2)}</span>
				</div>
				<p className="text-sm text-muted-foreground">
					Base nightly rate: $
					{nights > 0 ? (totalPrice / nights).toFixed(2) : '0'}
					/night
				</p>
				<p className="text-xs text-muted-foreground">
					*Room rate only - fees and taxes will be calculated at checkout
				</p>
			</div>
		);
	};

	const renderEmptyState = () => {
		return (
			<div className="text-center py-8">
				<Icon
					icon="tabler:calendar-question"
					className="size-12 text-muted-foreground mx-auto mb-4"
				/>
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
		<div className={`space-y-6 scroll-mt-24 ${className}`} data-booking-info>
			<Card className="border-border">
				<CardHeader>
					<CardTitle className="text-2xl text-foreground">
						Booking Summary
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{selectedDateRange?.from && selectedDateRange?.to ? (
						<div className="space-y-4">
							<p>
								<span className="text-sm text-muted-foreground">
									Selected Room:
								</span>{' '}
								<br />
								<span className="font-semibold">{roomName}</span>
							</p>
							<p className="text-sm text-muted-foreground mb-0">
								Selected Dates:
							</p>
							{renderDateDisplay()}
							{renderPricingBreakdown()}
							<p className="text-sm text-muted-foreground text-center">
								Proceed to payment for your booking of {nights} night
								{nights !== 1 ? 's' : ''} at the Irishette in the {roomName}.
							</p>
							<Button size="lg" className="w-full" onClick={onBookNow}>
								<Icon icon="tabler:credit-card-pay" className="size-6" />
								Book {roomName} Now
							</Button>
						</div>
					) : (
						renderEmptyState()
					)}
				</CardContent>
				<CardFooter>
					<p className="text-xs text-muted-foreground text-center">
						Be sure to review our{' '}
						<Link
							to="/cancellation-refund-policy"
							target="_blank"
							className="text-primary hover:text-accent underline"
						>
							Cancellation & Refund Policy
						</Link>{' '}
						before completing any bookings.
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
