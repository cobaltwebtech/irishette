// Estimated arrival windows (src/lib/site.ts ARRIVAL_WINDOW_STARTS). Pure.
// The hosts meet every guest in person to hand over the key, so each booking
// records roughly when the guest expects to arrive. The value stored is the
// window's start ("13:00"); the last window means "after" that time.

import { z } from 'zod';

import { ARRIVAL_WINDOW_STARTS, formatTimeOfDay } from '@/lib/site';

export type ArrivalWindow = (typeof ARRIVAL_WINDOW_STARTS)[number];

const LAST_START = ARRIVAL_WINDOW_STARTS[ARRIVAL_WINDOW_STARTS.length - 1];

export const arrivalWindowSchema = z.enum(ARRIVAL_WINDOW_STARTS, {
	error: 'Please select your estimated arrival time',
});

/** "13:00" -> "1:00 PM - 2:00 PM"; the last window is "After 11:00 PM". */
export function arrivalWindowLabel(window: ArrivalWindow): string {
	const start = formatTimeOfDay(window);
	if (window === LAST_START) return `After ${start}`;
	const hour = Number(window.slice(0, 2));
	const end = formatTimeOfDay(`${String(hour + 1).padStart(2, '0')}:00`);
	return `${start} - ${end}`;
}

/** The label for a stored value, or null (older bookings have none). */
export function storedArrivalLabel(value: string | null): string | null {
	const parsed = arrivalWindowSchema.safeParse(value);
	return parsed.success ? arrivalWindowLabel(parsed.data) : null;
}

/** The choices for the booking form, earliest first. */
export const ARRIVAL_WINDOW_OPTIONS = ARRIVAL_WINDOW_STARTS.map((value) => ({
	value,
	label: arrivalWindowLabel(value),
}));
