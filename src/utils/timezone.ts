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

/**
 * ISO 8601 timestamp of `instant` in `timeZone` with its UTC offset, e.g.
 * `2030-06-10T16:00:00-05:00` (machine-readable markup; not for display).
 */
export function formatInstantIso(
	instant: Date,
	timeZone = PROPERTY_TIMEZONE,
): string {
	const offset = offsetMs(timeZone, instant);
	const local = new Date(
		Math.floor(instant.getTime() / 1000) * 1000 + offset,
	).toISOString();
	const minutes = Math.abs(offset) / 60_000;
	const sign = offset < 0 ? '-' : '+';
	const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
	const mm = String(minutes % 60).padStart(2, '0');
	return `${local.slice(0, 19)}${sign}${hh}:${mm}`;
}

// --- Display (all pages and emails show US Central Time) ----------------------
// Guests check in at the property, so every date and time is shown in
// America/Chicago, never in the browser's or the server's time zone, and
// always in en-US (the server-rendered HTML and the browser agree).

export type DateStyle = 'short' | 'medium' | 'mediumWeekday' | 'long' | 'full';

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
	/** 6/10/2030 */
	short: { month: 'numeric', day: 'numeric', year: 'numeric' },
	/** Jun 10, 2030 */
	medium: { month: 'short', day: 'numeric', year: 'numeric' },
	/** Mon, Jun 10, 2030 */
	mediumWeekday: {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	},
	/** June 10, 2030 */
	long: { month: 'long', day: 'numeric', year: 'numeric' },
	/** Monday, June 10, 2030 */
	full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
};

const displayFormatters = new Map<string, Intl.DateTimeFormat>();

function displayFormatter(
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
	key: string,
) {
	const id = `${timeZone}|${key}`;
	let f = displayFormatters.get(id);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
		displayFormatters.set(id, f);
	}
	return f;
}

/**
 * A property-local stay date (`YYYY-MM-DD`, e.g. check-in) for display. It is
 * a calendar date, not an instant: the same day for everyone.
 */
export function formatStayDate(date: IsoDate, style: DateStyle = 'medium') {
	return displayFormatter('UTC', DATE_STYLES[style], style).format(
		new Date(`${date}T00:00:00Z`),
	);
}

/** The Central Time calendar date of an instant (e.g. "Member since"). */
export function formatDateCT(
	instant: Date | string | number,
	style: DateStyle = 'medium',
) {
	return displayFormatter(PROPERTY_TIMEZONE, DATE_STYLES[style], style).format(
		new Date(instant),
	);
}

/** An instant as "Nov 8, 2026, 3:04 PM CT". */
export function formatDateTimeCT(instant: Date | string | number) {
	const f = displayFormatter(
		PROPERTY_TIMEZONE,
		{ dateStyle: 'medium', timeStyle: 'short' },
		'dateTime',
	);
	return `${f.format(new Date(instant))} CT`;
}

/** The Central Time year of an instant (footer copyright). */
export function yearCT(instant: Date | string | number) {
	return dateInZone(new Date(instant)).slice(0, 4);
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
