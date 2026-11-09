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
import { formatStayDate } from '@/lib/timezone';
import { toISODateString } from '@/utils/booking-utils';

interface BookingInfoProps {
	selectedDateRange: DateRange | undefined;
	totalPrice: number;
	nights: number;
	onBookNow: () => void;
	roomName: string;
	className?: string;
}

export default function BookingInfo({
	selectedDateRange,
	totalPrice,
	nights,
	onBookNow,
	roomName,
	className = '',
}: BookingInfoProps) {
	// The picker's calendar day, shown as a property-local stay date.
	const formatDate = (date: Date) =>
		formatStayDate(toISODateString(date), 'mediumWeekday');

	const renderDateDisplay = () => {
		if (!selectedDateRange?.from || !selectedDateRange?.to) return null;

		return (
			<div className="space-y-2">
				<p>
					<Icon
						icon="tabler:door-enter"
						className="inline size-6 text-primary"
					/>
					<span className="italic">Check In</span> -{' '}
					<span className="font-semibold">
						{formatDate(selectedDateRange.from)}
					</span>
				</p>
				<p>
					<Icon
						icon="tabler:door-exit"
						className="inline size-6 text-accent-4"
					/>
					<span className="italic">Check Out</span> -{' '}
					<span className="font-semibold">
						{formatDate(selectedDateRange.to)}
					</span>
				</p>
			</div>
		);
	};

	const renderPricingBreakdown = () => {
		return (
			<div className="mt-4 space-y-2 rounded-md border bg-muted/50 p-4">
				<div className="flex items-center justify-between">
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
			<div className="space-y-2 py-8 text-center">
				<Icon
					icon="tabler:calendar-question"
					className="mx-auto size-12 text-muted-foreground"
				/>
				<p className="text-muted-foreground">
					Select your check-in and check-out dates to see pricing and
					availability
				</p>
				<p className="text-sm text-muted-foreground">
					Maximum stay is 30 nights.
				</p>
			</div>
		);
	};

	return (
		<div className={`scroll-mt-24 space-y-6 ${className}`} data-booking-info>
			<Card>
				<CardHeader>
					<CardTitle className="text-center text-2xl text-foreground">
						Booking Summary
					</CardTitle>
				</CardHeader>
				<CardContent>
					{selectedDateRange?.from && selectedDateRange?.to ? (
						<div className="space-y-2">
							<p>
								<span className="text-sm text-muted-foreground">
									Selected Room:
								</span>{' '}
								<br />
								<span className="font-semibold">{roomName}</span>
							</p>
							<p className="text-sm text-muted-foreground">Selected Dates:</p>
							{renderDateDisplay()}
							{renderPricingBreakdown()}
							<p className="text-center text-sm text-muted-foreground">
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
					<p className="text-center text-xs text-muted-foreground">
						Be sure to review our{' '}
						<Link
							to="/cancellation-refund-policy"
							target="_blank"
							className="text-primary underline hover:text-accent"
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
