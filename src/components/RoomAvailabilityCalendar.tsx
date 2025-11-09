import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';

interface Room {
	id: string;
	name: string;
	slug: string;
	basePrice: number;
	status: string;
}

interface CalendarDay {
	date: string;
	available: boolean;
	blocked: boolean;
	price: number;
	source?: string | null;
	booking?: {
		id: string;
		confirmationId: string;
		checkInDate: string;
		checkOutDate: string;
	} | null;
}

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

export default function RoomAvailabilityCalendar({
	roomSlug,
	onDateRangeSelect,
	selectedDateRange,
	className = 'rounded-lg border shadow-sm',
	minNights = 1,
	maxNights = 30,
}: RoomAvailabilityCalendarProps) {
	const [dateRange, setDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);

	// Calculate date range for the API call (10 months from today)
	const dateParams = useMemo(() => {
		const today = new Date();
		const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const endDate = new Date();
		endDate.setMonth(today.getMonth() + 10);
		const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

		return {
			roomSlug,
			startDate,
			endDate: endDateStr,
		};
	}, [roomSlug]);

	// Fetch availability data using tRPC
	const availabilityQuery = useQuery(
		trpc.availability.getBySlug.queryOptions(dateParams),
	);

	// Calculate total price and nights for the selected range
	const calculateStayDetails = async (
		range: DateRange | undefined,
		room: Room | undefined,
		calendar: CalendarDay[],
	) => {
		if (!range?.from || !range?.to || !room) {
			return { totalPrice: 0, nights: 0 };
		}

		const start = new Date(range.from);
		const end = new Date(range.to);
		const nights = Math.ceil(
			(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
		);

		try {
			// Create date strings without timezone conversion
			const checkInDate = `${range.from.getFullYear()}-${String(range.from.getMonth() + 1).padStart(2, '0')}-${String(range.from.getDate()).padStart(2, '0')}`;
			const checkOutDate = `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, '0')}-${String(range.to.getDate()).padStart(2, '0')}`;

			// Use tRPC to calculate pricing with dynamic rules
			const pricing = await trpcClient.rooms.calculatePricing.query({
				roomId: room.id,
				checkInDate,
				checkOutDate,
				guestCount: 2, // Default guest count
			});

			// For the room selection page, we return the baseAmount which includes
			// the base price plus any applied pricing rules
			return {
				totalPrice: pricing.baseAmount,
				nights: pricing.numberOfNights,
			};
		} catch (error) {
			console.warn(
				'Failed to calculate dynamic pricing, falling back to base price:',
				error,
			);

			// Fallback to basic calculation if API fails
			let totalPrice = 0;
			const current = new Date(start);

			while (current < end) {
				const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
				const dayData = calendar.find((day) => day.date === dateStr);
				totalPrice += dayData?.price || room?.basePrice || 0;
				current.setDate(current.getDate() + 1);
			}

			return { totalPrice, nights };
		}
	};

	const handleDateRangeSelect = async (range: DateRange | undefined) => {
		const availability = availabilityQuery.data;
		if (!availability) return;

		// Validate the range doesn't include any blocked dates
		if (range?.from && range?.to) {
			const start = new Date(range.from);
			const end = new Date(range.to);
			const current = new Date(start);

			// Check if any date in the stay period (excluding checkout day) is blocked
			while (current < end) {
				const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
				const dayData = availability.calendar.find(
					(day) => day.date === dateStr,
				);

				// Check if this date is blocked - this prevents staying ON blocked dates
				// The checkout day is already excluded from this loop
				if (dayData && (!dayData.available || dayData.blocked)) {
					// Don't allow selection that includes any blocked dates in the stay period
					return;
				}
				current.setDate(current.getDate() + 1);
			} // Check min/max nights
			const nights = Math.ceil(
				(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
			);
			if (nights < minNights || nights > maxNights) {
				return;
			}
		}

		setDateRange(range);
		const { totalPrice, nights } = await calculateStayDetails(
			range,
			availability.room,
			availability.calendar,
		);
		onDateRangeSelect?.(range, totalPrice, nights);
	};

	// Calculate derived data from query results
	const { availableDates, checkoutOnlyDates, unavailableDates } =
		useMemo(() => {
			if (!availabilityQuery.data?.calendar) {
				return {
					availableDates: [],
					checkoutOnlyDates: [],
					unavailableDates: [],
				};
			}

			const calendar = availabilityQuery.data.calendar;

			// Helper function to create local dates
			const createDate = (dateString: string) => {
				const [year, month, day] = dateString.split('-').map(Number);
				return new Date(year, month - 1, day); // month is 0-indexed in JavaScript Date
			};

			// Find dates that are blocked but can be used as checkout dates
			// These are dates where a booking starts (check-in day for someone else)
			const findCheckoutOnlyDates = () => {
				const checkoutDates = new Set<string>();

				// Look through all blocked dates to find check-in dates
				for (let i = 0; i < calendar.length; i++) {
					const day = calendar[i];

					// If this date is blocked and has booking info
					if ((!day.available || day.blocked) && day.booking) {
						// The check-in date of this booking can be used as a checkout date
						// by someone who books the night before
						const checkInDate = day.booking.checkInDate;
						checkoutDates.add(checkInDate);
					}
				}

				return Array.from(checkoutDates).map((dateStr) => createDate(dateStr));
			};

			const checkoutOnly = findCheckoutOnlyDates();

			return {
				// Available dates (excluding checkout-only dates)
				availableDates: calendar
					.filter((day: CalendarDay) => day.available && !day.blocked)
					.map((day: CalendarDay) => createDate(day.date)),

				// Checkout-only dates: dates that are blocked but can be used as checkout dates
				checkoutOnlyDates: checkoutOnly,

				// All unavailable dates (excluding checkout-only dates for visual distinction)
				unavailableDates: calendar
					.filter((day: CalendarDay) => {
						if (!day.available || day.blocked) {
							// Exclude checkout-only dates from unavailable visual styling
							const isCheckoutOnly =
								day.booking && day.date === day.booking.checkInDate;
							return !isCheckoutOnly;
						}
						return false;
					})
					.map((day: CalendarDay) => createDate(day.date)),
			};
		}, [availabilityQuery.data?.calendar]);

	if (availabilityQuery.isPending) {
		return (
			<div className={`${className} p-8 text-center`}>
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
				<p className="text-muted-foreground">Loading availability...</p>
			</div>
		);
	}

	if (availabilityQuery.isError) {
		return (
			<div className={`${className} p-8 text-center`}>
				<p className="text-destructive mb-4">Error loading calendar</p>
				<p className="text-sm text-muted-foreground">
					{availabilityQuery.error?.message || 'Failed to load availability'}
				</p>
				<button
					type="button"
					onClick={() => availabilityQuery.refetch()}
					className="text-primary hover:text-primary/80 underline"
				>
					Try again
				</button>
			</div>
		);
	}

	// Custom disabled function that allows checkout-only dates for range end selection
	const getDisabledDates = (date: Date) => {
		// Always disable past dates
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (date < today) {
			return true;
		}

		const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		const dayData = availabilityQuery.data?.calendar.find(
			(day: CalendarDay) => day.date === dateStr,
		);

		// If no data for this date, assume available
		if (!dayData) return false;

		// If this date is blocked/unavailable
		if (!dayData.available || dayData.blocked) {
			// Check if this is a checkout-only date (check-in date for another booking)
			const isCheckoutOnly =
				dayData.booking && dayData.date === dayData.booking.checkInDate;

			// If we're selecting the end date (already have a start date) and this is checkout-only, allow it
			if (dateRange?.from && !dateRange?.to && isCheckoutOnly) {
				return false; // Allow as checkout date
			}

			// Otherwise, disable all blocked dates (including checkout-only for check-in)
			return true;
		}

		return false;
	};

	return (
		<div className="space-y-4">
			<Calendar
				mode="range"
				selected={dateRange}
				onSelect={handleDateRangeSelect}
				defaultMonth={dateRange?.from || new Date()}
				disabled={getDisabledDates}
				hidden={{
					before: new Date(),
					after: (() => {
						const maxDate = new Date();
						maxDate.setMonth(maxDate.getMonth() + 10);
						return maxDate;
					})(),
				}}
				modifiers={{
					unavailable: unavailableDates,
					available: availableDates,
					checkoutOnly: checkoutOnlyDates,
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
			<div className="block sm:hidden mx-auto w-fit">
				<Button
					type="button"
					size="lg"
					onClick={() => {
						const bookingInfo = document.querySelector('[data-booking-info]');
						if (bookingInfo) {
							bookingInfo.scrollIntoView({
								behavior: 'smooth',
								block: 'start',
							});
						}
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
						<div className="size-6 bg-white border border-primary/20 rounded"></div>
						<span>Available</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 bg-amber-200 border border-accent rounded"></div>
						<span>Checkout Only</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 bg-destructive/40 border border-destructive rounded"></div>
						<span>Unavailable</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-6 bg-primary rounded"></div>
						<span>Selected</span>
					</div>
				</div>

				{/* Stay requirements */}
				<div className="text-muted-foreground text-center text-xs space-y-1">
					<p>
						Your stay must be between {minNights} and {maxNights} nights
					</p>
					<p>
						Maximum availability to book a room is up to 10 months from today.
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
