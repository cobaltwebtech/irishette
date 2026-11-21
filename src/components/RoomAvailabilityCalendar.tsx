import { Icon } from '@iconify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

import {
	AvailabilityCalendar,
	AvailabilityLegend,
	stayFromRange,
} from '@/components/booking/AvailabilityCalendar';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { SAME_DAY_CUTOFF_LABEL } from '@/lib/site';
import {
	BOOKING_WINDOW_MONTHS,
	daysBetween,
	MAX_NIGHTS,
	type Unavailability,
} from '@/utils/date-range';

interface RoomAvailabilityCalendarProps {
	roomSlug: string;
	onDateRangeSelect?: (
		dateRange: DateRange | undefined,
		totalPrice?: number,
		nights?: number,
	) => void;
	selectedDateRange?: DateRange;
	className?: string;
	minNights?: number;
	maxNights?: number;
}

const EMPTY: Unavailability = { stays: [], events: [], blocks: [] };

/**
 * Booking calendar for a room page: the public availability query and the
 * room price for the picked stay, around the shared AvailabilityCalendar
 * (a day is unavailable for check-in if its night is booked, held, imported
 * or blocked; check-out is allowed on the first unavailable day after an
 * available night, "checkout only").
 */
export default function RoomAvailabilityCalendar({
	roomSlug,
	onDateRangeSelect,
	selectedDateRange,
	className = 'rounded-lg border shadow-sm',
	minNights = 1,
	maxNights = MAX_NIGHTS,
}: RoomAvailabilityCalendarProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [dateRange, setDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);

	// The window (today, the same-day cutoff, the last check-out) comes from
	// the server in property time, never from the browser's clock.
	const availabilityQuery = useQuery(
		trpc.availability.getBySlug.queryOptions({
			roomSlug,
			monthsAhead: BOOKING_WINDOW_MONTHS,
		}),
	);
	const data = availabilityQuery.data;
	const roomId = data?.room.id;
	// Empty until loaded; the calendar renders only after the data arrives.
	const todayIso = data?.today ?? '';
	const earliestIso = data?.earliestCheckIn ?? todayIso;
	const sameDayClosed = earliestIso > todayIso;

	const handleSelect = async (range: DateRange | undefined) => {
		if (!availabilityQuery.data || !roomId) return;
		setDateRange(range);
		const stay = stayFromRange(range);
		if (!stay) {
			onDateRangeSelect?.(range, 0, 0);
			return;
		}
		try {
			// Same calculation as checkout; always fresh.
			const pricing = await queryClient.fetchQuery({
				...trpc.rooms.calculatePricing.queryOptions({
					roomId,
					checkInDate: stay.checkIn,
					checkOutDate: stay.checkOut,
				}),
				staleTime: 0,
			});
			onDateRangeSelect?.(range, pricing.baseAmount, pricing.numberOfNights);
		} catch (error) {
			console.warn('Could not price the stay:', error);
			onDateRangeSelect?.(range, 0, daysBetween(stay.checkIn, stay.checkOut));
		}
	};

	if (availabilityQuery.isPending) {
		return (
			<div className={`${className} p-8 text-center`}>
				<div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
				<p className="text-muted-foreground">Loading availability...</p>
			</div>
		);
	}

	if (availabilityQuery.isError) {
		return (
			<div className={`${className} p-8 text-center`}>
				<p className="mb-4 text-destructive">Error loading calendar</p>
				<p className="text-sm text-muted-foreground">
					{availabilityQuery.error?.message || 'Failed to load availability'}
				</p>
				<button
					type="button"
					onClick={() => availabilityQuery.refetch()}
					className="text-primary underline hover:text-primary/80"
				>
					Try again
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<AvailabilityCalendar
				unavailability={data?.unavailability ?? EMPTY}
				today={todayIso}
				earliest={earliestIso}
				last={data?.lastCheckOut ?? todayIso}
				selected={dateRange}
				onSelect={handleSelect}
				minNights={minNights}
				maxNights={maxNights}
				className={className}
			/>

			{/* Clear Selection Button */}
			{dateRange?.from && (
				<div className="flex justify-center">
					<Button
						type="button"
						onClick={() => {
							setDateRange(undefined);
							onDateRangeSelect?.(undefined, 0, 0);
						}}
						variant="outline"
					>
						<Icon icon="tabler:letter-x" className="size-5" />
						Clear Selection
					</Button>
				</div>
			)}
			{/* Continue Button (mobile only) */}
			<div className="mx-auto block w-fit sm:hidden">
				<Button
					type="button"
					size="lg"
					onClick={() => {
						const bookingInfo = document.querySelector('[data-booking-info]');
						bookingInfo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}}
				>
					<Icon icon="tabler:circle-arrow-down-filled" className="size-5" />
					Continue Booking
				</Button>
			</div>

			{/* Legend and Info */}
			<div className="space-y-3">
				<AvailabilityLegend />

				<div className="space-y-1 text-center text-xs text-muted-foreground">
					<p>
						Your stay must be between {minNights} and {maxNights} nights
					</p>
					<p>
						Maximum availability to book a room is up to {BOOKING_WINDOW_MONTHS}{' '}
						months from today.
					</p>
					<p>
						Same-day check-in is available until {SAME_DAY_CUTOFF_LABEL}.
						{sameDayClosed &&
							' Today is closed; the earliest check-in is tomorrow.'}
					</p>
					<p>
						"Checkout Only" dates can only be selected as your checkout date,
						not check-in.
					</p>
				</div>
			</div>
		</div>
	);
}
