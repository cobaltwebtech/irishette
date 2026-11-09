// The property's fixed times as instants (plan 02, 3.9). Pure and
// client-safe. All rules use America/Chicago wall-clock time, whatever the
// server's or browser's time zone: check-in 4:00 PM, check-out 11:00 AM, and
// same-day check-in only before 9:00 AM (src/lib/site.ts).

import { addDays, type IsoDate } from './date-range';
import { CHECK_IN_TIME, CHECK_OUT_TIME, SAME_DAY_CUTOFF_TIME } from './site';
import { dateInZone, zonedTimeToUtc } from './timezone';

/** Check-in on `date` (4:00 PM CT) as a UTC instant. */
export const checkInAt = (date: IsoDate) => zonedTimeToUtc(date, CHECK_IN_TIME);

/** Check-out on `date` (11:00 AM CT) as a UTC instant. */
export const checkOutAt = (date: IsoDate) =>
	zonedTimeToUtc(date, CHECK_OUT_TIME);

/**
 * The instant `hoursBefore` hours before local `time` on `date`, counted on
 * the local (wall) clock: whole days go back by calendar days and the rest by
 * hours. "72 hours before 4:00 PM" is 4:00 PM three calendar days earlier, so
 * it stays 4:00 PM across a DST change (that day has 71 or 73 elapsed hours).
 */
export function localCutoff(
	date: IsoDate,
	time: string,
	hoursBefore: number,
): Date {
	const [hh = 0, mm = 0] = time.split(':').map(Number);
	let days = Math.floor(hoursBefore / 24);
	let minutes = hh * 60 + mm - (hoursBefore % 24) * 60;
	while (minutes < 0) {
		minutes += 24 * 60;
		days += 1;
	}
	const local = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
	return zonedTimeToUtc(addDays(date, -days), local);
}

/**
 * The earliest check-in date a new hold may have: today (property date)
 * until 9:00 AM CT, tomorrow after that.
 */
export function earliestCheckInDate(now = new Date()): IsoDate {
	const today = dateInZone(now);
	return now < zonedTimeToUtc(today, SAME_DAY_CUTOFF_TIME)
		? today
		: addDays(today, 1);
}

export type StayPhase = 'upcoming' | 'in_stay' | 'past';

/** Before check-in (4:00 PM CT), during the stay, after check-out (11:00 AM CT). */
export function stayPhase(
	stay: { checkInAt: Date; checkOutAt: Date },
	now = new Date(),
): StayPhase {
	if (now < stay.checkInAt) return 'upcoming';
	if (now < stay.checkOutAt) return 'in_stay';
	return 'past';
}
