import { Icon } from '@iconify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useTRPC } from '@/integrations/trpc/react';
import {
	addDays,
	daysBetween,
	isCheckInDisabled,
	isCheckOutAllowed,
	isNightUnavailable,
	isStayAvailable,
	type Unavailability,
} from '@/lib/date-range';

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

const MONTHS_AHEAD = 10;

/** Local calendar date → YYYY-MM-DD (no timezone shift). */
function toIso(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const EMPTY: Unavailability = { stays: [], events: [], blocks: [] };

/**
 * Booking calendar. Uses the same date rules as the server
 * (src/lib/date-range.ts): a day is unavailable for check-in if its night is
 * booked, held, imported or blocked; check-out is allowed on the first
 * unavailable day after an available night ("checkout only").
 */
export default function RoomAvailabilityCalendar({
	roomSlug,
	onDateRangeSelect,
	selectedDateRange,
	className = 'rounded-lg border shadow-sm',
	minNights = 1,
	maxNights = 30,
}: RoomAvailabilityCalendarProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [dateRange, setDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const lastDay = new Date(today);
	lastDay.setMonth(lastDay.getMonth() + MONTHS_AHEAD);

	const availabilityQuery = useQuery(
		trpc.availability.getBySlug.queryOptions({
			roomSlug,
			startDate: toIso(today),
			endDate: toIso(lastDay),
		}),
	);
	const unavailability = availabilityQuery.data?.unavailability ?? EMPTY;
	const roomId = availabilityQuery.data?.room.id;

	const isUnavailable = (date: Date) =>
		isNightUnavailable(toIso(date), unavailability);
	/** Unavailable night that follows an available one: check-out only. */
	const isCheckoutOnly = (date: Date) => {
		const iso = toIso(date);
		return (
			isNightUnavailable(iso, unavailability) &&
			!isNightUnavailable(addDays(iso, -1), unavailability)
		);
	};

	const isDisabled = (date: Date) => {
		if (date < today) return true;
		const iso = toIso(date);
		const from = dateRange?.from ? toIso(dateRange.from) : null;
		// Picking the check-out day: any day the stay can run to.
		if (from && !dateRange?.to && iso > from) {
			return (
				!isCheckOutAllowed(from, iso, unavailability) ||
				daysBetween(from, iso) > maxNights
			);
		}
		return isCheckInDisabled(iso, unavailability);
	};

	const handleSelect = async (range: DateRange | undefined) => {
		if (!availabilityQuery.data || !roomId) return;
		if (range?.from && range.to) {
			const checkIn = toIso(range.from);
			const checkOut = toIso(range.to);
			const nights = daysBetween(checkIn, checkOut);
			if (
				nights < minNights ||
				nights > maxNights ||
				!isStayAvailable({ checkIn, checkOut }, unavailability)
			) {
				return;
			}
			setDateRange(range);
			try {
				// Same calculation as checkout; always fresh.
				const pricing = await queryClient.fetchQuery({
					...trpc.rooms.calculatePricing.queryOptions({
						roomId,
						checkInDate: checkIn,
						checkOutDate: checkOut,
					}),
					staleTime: 0,
				});
				onDateRangeSelect?.(range, pricing.baseAmount, pricing.numberOfNights);
			} catch (error) {
				console.warn('Could not price the stay:', error);
				onDateRangeSelect?.(range, 0, nights);
			}
			return;
		}
		setDateRange(range);
		onDateRangeSelect?.(range, 0, 0);
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
			<Calendar
				mode="range"
				selected={dateRange}
				onSelect={handleSelect}
				defaultMonth={dateRange?.from || today}
				disabled={isDisabled}
				hidden={{ before: today, after: lastDay }}
				modifiers={{
					unavailable: (date: Date) =>
						isUnavailable(date) && !isCheckoutOnly(date),
					checkoutOnly: isCheckoutOnly,
					available: (date: Date) => !isUnavailable(date),
				}}
				modifiersClassNames={{
					unavailable: 'bg-destructive/40 line-through opacity-75',
					available: 'hover:bg-secondary/80 border-primary/20',
					checkoutOnly: 'bg-amber-200 border-orange-300 hover:bg-secondary/80',
					selected: 'bg-primary text-primary-foreground hover:bg-primary/0',
				}}
				numberOfMonths={2}
				min={minNights}
				max={maxNights}
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
				<div className="flex flex-wrap justify-center gap-4 text-sm">
					<div className="flex items-center gap-2">
						<div className="size-6 rounded border border-primary/20 bg-white"></div>
						<span>Available</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 rounded border border-accent bg-amber-200"></div>
						<span>Checkout Only</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 rounded border border-destructive bg-destructive/40"></div>
						<span>Unavailable</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 rounded bg-primary"></div>
						<span>Selected</span>
					</div>
				</div>

				<div className="space-y-1 text-center text-xs text-muted-foreground">
					<p>
						Your stay must be between {minNights} and {maxNights} nights
					</p>
					<p>
						Maximum availability to book a room is up to {MONTHS_AHEAD} months
						from today.
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
