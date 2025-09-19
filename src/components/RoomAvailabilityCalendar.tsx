'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';

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
	source?: string;
	booking?: {
		id: string;
		confirmationId: string;
		checkInDate: string;
		checkOutDate: string;
	};
}

interface AvailabilityData {
	room?: Room;
	calendar: CalendarDay[];
	loading: boolean;
	error?: string;
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
	const [availability, setAvailability] = useState<AvailabilityData>({
		calendar: [],
		loading: true,
	});

	const [dateRange, setDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);

	// Fetch room availability data
	const fetchAvailability = useCallback(async () => {
		try {
			setAvailability((prev) => ({ ...prev, loading: true, error: undefined }));

			// Calculate date range for the API call (3 months from today)
			const today = new Date();
			const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			const endDate = new Date();
			endDate.setMonth(today.getMonth() + 3);
			const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

			// Call the availability API
			const response = await fetch(
				`/api/trpc/availability.getBySlug?input=${encodeURIComponent(
					JSON.stringify({
						roomSlug,
						startDate,
						endDate: endDateStr,
					}),
				)}`,
			);

			if (!response.ok) {
				throw new Error('Failed to fetch availability data');
			}

			const data = (await response.json()) as {
				result: {
					data: {
						room: Room;
						calendar: CalendarDay[];
					};
				};
			};

			const { room, calendar } = data.result.data;

			setAvailability({
				room,
				calendar,
				loading: false,
			});
		} catch (error) {
			setAvailability((prev) => ({
				...prev,
				loading: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to load availability',
			}));
		}
	}, [roomSlug]);

	useEffect(() => {
		fetchAvailability();
	}, [fetchAvailability]);

	// Calculate total price and nights for the selected range
	const calculateStayDetails = useCallback(
		async (range: DateRange | undefined) => {
			if (!range?.from || !range?.to || !availability.room) {
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

				// Use the new tRPC endpoint to calculate pricing with dynamic rules
				const response = await fetch(
					`/api/trpc/rooms.calculatePricing?input=${encodeURIComponent(
						JSON.stringify({
							roomId: availability.room.id,
							checkInDate,
							checkOutDate,
							guestCount: 2, // Default guest count
						}),
					)}`,
				);

				if (!response.ok) {
					throw new Error('Failed to calculate pricing');
				}

				const data = (await response.json()) as {
					result: {
						data: {
							baseAmount: number;
							numberOfNights: number;
							appliedRules: Array<{
								id: string;
								name: string;
								ruleType: string;
								value: number;
								appliedAmount: number;
							}>;
							roomBasePrice: number;
						};
					};
				};

				const pricing = data.result.data;

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
					const dayData = availability.calendar.find(
						(day) => day.date === dateStr,
					);
					totalPrice += dayData?.price || availability.room?.basePrice || 0;
					current.setDate(current.getDate() + 1);
				}

				return { totalPrice, nights };
			}
		},
		[availability.calendar, availability.room],
	);

	const handleDateRangeSelect = async (range: DateRange | undefined) => {
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
		const { totalPrice, nights } = await calculateStayDetails(range);
		onDateRangeSelect?.(range, totalPrice, nights);
	};

	// Convert calendar data to Date objects for the calendar component
	// Use local timezone to avoid date shifting issues
	const createLocalDate = (dateString: string) => {
		const [year, month, day] = dateString.split('-').map(Number);
		return new Date(year, month - 1, day); // month is 0-indexed in JavaScript Date
	};

	// Available dates
	const availableDates = availability.calendar
		.filter((day) => day.available && !day.blocked)
		.map((day) => createLocalDate(day.date));

	// External blocked dates that can be used for checkout only (from Airbnb, Expedia, etc.)
	const checkoutOnlyDates = availability.calendar
		.filter(
			(day) =>
				(!day.available || day.blocked) &&
				(day.source === 'airbnb' || day.source === 'expedia'),
		)
		.map((day) => createLocalDate(day.date));

	// All unavailable dates (combines bookings and blocked periods)
	const unavailableDates = availability.calendar
		.filter(
			(day) =>
				(!day.available || day.blocked) &&
				day.source !== 'airbnb' &&
				day.source !== 'expedia',
		)
		.map((day) => createLocalDate(day.date));

	if (availability.loading) {
		return (
			<div className={`${className} p-8 text-center`}>
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
				<p className="text-muted-foreground">Loading availability...</p>
			</div>
		);
	}

	if (availability.error) {
		return (
			<div className={`${className} p-8 text-center`}>
				<p className="text-destructive mb-4">Error loading calendar</p>
				<p className="text-sm text-muted-foreground">{availability.error}</p>
				<button
					type="button"
					onClick={fetchAvailability}
					className="text-primary hover:text-primary/80 underline"
				>
					Try again
				</button>
			</div>
		);
	}

	// Custom disabled function that allows checkout on blocked dates
	const getDisabledDates = (date: Date, selectedRange?: DateRange) => {
		// Always disable past dates
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (date < today) {
			return true;
		}

		const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		const dayData = availability.calendar.find((day) => day.date === dateStr);

		// If no data for this date, assume available
		if (!dayData) return false;

		// If this date is blocked/unavailable
		if (!dayData.available || dayData.blocked) {
			// If this is an external block (Airbnb/Expedia), allow it for checkout only
			if (dayData.source === 'airbnb' || dayData.source === 'expedia') {
				// If we already have a "from" date selected, check if this could be a valid checkout date
				if (selectedRange?.from && !selectedRange?.to) {
					// Allow any external blocked date as checkout (not just next day)
					return false; // Allow as checkout
				}
				// Otherwise, disable for check-in
				return true;
			}

			// If this is a booking block, always disable
			if (dayData.source === 'booking') {
				return true;
			}

			// For any other blocked dates, disable
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
				disabled={(date) => getDisabledDates(date, dateRange)}
				modifiers={{
					unavailable: unavailableDates,
					available: availableDates,
					checkoutOnly: checkoutOnlyDates,
				}}
				modifiersClassNames={{
					unavailable:
						'bg-destructive/20 text-destructive line-through opacity-75',
					available: 'bg-secondary hover:bg-secondary/80 border-primary/20',
					checkoutOnly:
						'bg-accent/20 text-accent border-accent/30 hover:bg-accent/30',
					selected: 'bg-primary text-primary-foreground hover:bg-primary/90',
				}}
				numberOfMonths={2}
				min={minNights}
				max={maxNights}
				className={className}
			/>

			{/* Clear Selection Button */}
			{dateRange?.from && (
				<div className="flex justify-center">
					<button
						type="button"
						onClick={() => {
							setDateRange(undefined);
							onDateRangeSelect?.(undefined, 0, 0);
						}}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-md transition-colors"
					>
						<X className="w-3 h-3" />
						Clear Selection
					</button>
				</div>
			)}

			{/* Legend and Info */}
			<div className="space-y-3">
				<div className="flex flex-wrap gap-4 text-sm">
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-secondary border border-primary/20 rounded"></div>
						<span>Available</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-destructive/20 border rounded"></div>
						<span>Unavailable</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-accent/20 border border-accent/30 rounded"></div>
						<span>Checkout Only</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-primary rounded"></div>
						<span>Selected</span>
					</div>
				</div>

				{/* Stay requirements */}
				<div className="text-muted-foreground text-center text-xs">
					Your stay must be between {minNights} and {maxNights} nights
				</div>
			</div>
		</div>
	);
}
