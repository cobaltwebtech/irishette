import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { parseISODateString, toISODateString } from '@/utils/booking-utils';
import {
	addDays,
	daysBetween,
	type IsoDate,
	isCheckInDisabled,
	isCheckOutAllowed,
	isNightUnavailable,
	isStayAvailable,
	type Unavailability,
} from '@/utils/date-range';

// The date-picking core shared by the guest room calendar and the admin
// booking and modification pages (plan 06). Props-driven: the caller loads
// the unavailable ranges and the window (today, earliest check-in, last
// check-out, all property-local dates from the server) and owns the
// selection. Same rules as the server (src/utils/date-range.ts).

// The day picker works in local calendar dates; these convert them to and
// from property-local YYYY-MM-DD stay dates without any time zone shift.
const toIso = toISODateString;
const fromIso = parseISODateString;

export interface AvailabilityWindow {
	unavailability: Unavailability;
	today: IsoDate;
	/** First allowed check-in (today, or tomorrow after the same-day cutoff). */
	earliest: IsoDate;
	/** Last allowed check-out. */
	last: IsoDate;
}

export interface AvailabilityCalendarProps extends AvailabilityWindow {
	selected: DateRange | undefined;
	/**
	 * A partial range (check-in only, or cleared), or a complete stay that
	 * passes every rule. Invalid complete ranges are ignored.
	 */
	onSelect: (range: DateRange | undefined) => void;
	minNights?: number;
	maxNights: number;
	numberOfMonths?: number;
	className?: string;
}

/** A complete stay as ISO dates, or null for a partial range. */
export function stayFromRange(range: DateRange | undefined) {
	if (!range?.from || !range.to) return null;
	return { checkIn: toIso(range.from), checkOut: toIso(range.to) };
}

export function AvailabilityCalendar({
	unavailability,
	today,
	earliest,
	last,
	selected,
	onSelect,
	minNights = 1,
	maxNights,
	numberOfMonths = 2,
	className = 'rounded-lg border shadow-sm',
}: AvailabilityCalendarProps) {
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
		const iso = toIso(date);
		if (iso < today || iso > last) return true;
		const from = selected?.from ? toIso(selected.from) : null;
		// Picking the check-out day: any day the stay can run to.
		if (from && !selected?.to && iso > from) {
			return (
				!isCheckOutAllowed(from, iso, unavailability) ||
				daysBetween(from, iso) > maxNights
			);
		}
		// Check-in: not before the earliest date (same-day cutoff).
		return iso < earliest || isCheckInDisabled(iso, unavailability);
	};

	const handleSelect = (range: DateRange | undefined) => {
		const stay = stayFromRange(range);
		if (stay) {
			const nights = daysBetween(stay.checkIn, stay.checkOut);
			if (
				nights < minNights ||
				nights > maxNights ||
				stay.checkIn < earliest ||
				stay.checkOut > last ||
				!isStayAvailable(stay, unavailability)
			) {
				return;
			}
		}
		onSelect(range);
	};

	return (
		<Calendar
			mode="range"
			selected={selected}
			onSelect={handleSelect}
			defaultMonth={selected?.from || fromIso(today)}
			disabled={isDisabled}
			hidden={{ before: fromIso(today), after: fromIso(last) }}
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
			numberOfMonths={numberOfMonths}
			min={minNights}
			max={maxNights}
			className={className}
		/>
	);
}

/** The colour key under a calendar. */
export function AvailabilityLegend() {
	return (
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
	);
}
