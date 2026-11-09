// Timezone helpers on top of Intl (no dependencies). Pure.

import type { IsoDate } from './date-range';

/** The property is in Dublin, Texas. */
export const PROPERTY_TIMEZONE = 'America/Chicago';

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of `instant` in `timeZone`, as `YYYY-MM-DD`. */
export function dateInZone(
	instant: Date,
	timeZone = PROPERTY_TIMEZONE,
): IsoDate {
	let f = dateFormatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});
		dateFormatters.set(timeZone, f);
	}
	return f.format(instant);
}

/** Today's date at the property (or in `timeZone`). */
export const todayIn = (timeZone = PROPERTY_TIMEZONE, now = new Date()) =>
	dateInZone(now, timeZone);

/** Offset of `timeZone` from UTC at `instant`, in ms (local - UTC). */
function offsetMs(timeZone: string, instant: Date): number {
	let f = partFormatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		partFormatters.set(timeZone, f);
	}
	const parts = Object.fromEntries(
		f.formatToParts(instant).map((p) => [p.type, p.value]),
	);
	const asUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
	);
	return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant of local wall-clock `date` + `time` ("HH:MM" or "HH:MM:SS") in
 * `timeZone`. Handles DST changes (a non-existent local time resolves to the
 * instant one hour later).
 */
export function zonedTimeToUtc(
	date: IsoDate,
	time: string,
	timeZone = PROPERTY_TIMEZONE,
): Date {
	const [y, m, d] = date.split('-').map(Number);
	const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
	const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
	const first = offsetMs(timeZone, new Date(wall));
	let utc = wall - first;
	const second = offsetMs(timeZone, new Date(utc));
	if (second !== first) utc = wall - second;
	return new Date(utc);
}

const instantFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: PROPERTY_TIMEZONE,
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
});

/**
 * An instant as property wall-clock time, e.g. "Tue, Jun 7, 2030, 4:00 PM CT".
 * Never uses the browser's or the server's time zone.
 */
export function formatInstantCT(instant: Date | string | number): string {
	return `${instantFormatter.format(new Date(instant))} CT`;
}
