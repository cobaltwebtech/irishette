// RFC 5545 parser for imported availability feeds (Airbnb, Expedia, Vrbo,
// Booking.com, ...). Pure. Only what availability needs: VEVENT UID, dates,
// SUMMARY and STATUS.
//
// Dates come out as property-local `YYYY-MM-DD` with an EXCLUSIVE end (iCal
// DTEND semantics):
// - DATE values are taken as-is.
// - UTC date-times (`...Z`) and TZID date-times are converted to the
//   property's timezone (America/Chicago) first.
// - Floating date-times use their own date.
// - No DTEND: DURATION if present, else one day for DATE events.

import { addDays, type IsoDate } from './date-range';
import { dateInZone, PROPERTY_TIMEZONE, zonedTimeToUtc } from './timezone';

export type ImportedEventKind = 'reserved' | 'unavailable';

export interface ImportedEvent {
	uid: string;
	start: IsoDate;
	end: IsoDate; // exclusive
	kind: ImportedEventKind;
	summary: string | null;
}

export interface ParseResult {
	/** True if the text contained BEGIN:VCALENDAR. */
	isCalendar: boolean;
	events: ImportedEvent[];
	skipped: {
		cancelled: number;
		noUid: number;
		ownExport: number;
		invalidDates: number;
		duplicateUid: number;
	};
}

interface Property {
	name: string;
	params: Record<string, string>;
	value: string;
}

/** Splits text into logical lines: any line ending, folded lines joined. */
export function unfoldLines(text: string): string[] {
	const physical = text.split(/\r\n|\n|\r/);
	const lines: string[] = [];
	for (const line of physical) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else {
			lines.push(line);
		}
	}
	return lines.filter((l) => l.length > 0);
}

/** `NAME;P1=a;P2="b:c":value` → { name, params, value }. */
function parseProperty(line: string): Property | null {
	let inQuotes = false;
	let colon = -1;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') inQuotes = !inQuotes;
		else if (c === ':' && !inQuotes) {
			colon = i;
			break;
		}
	}
	if (colon < 0) return null;
	const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';');
	const params: Record<string, string> = {};
	for (const p of rawParams) {
		const eq = p.indexOf('=');
		if (eq > 0) {
			params[p.slice(0, eq).toUpperCase()] = p
				.slice(eq + 1)
				.replace(/^"(.*)"$/, '$1');
		}
	}
	return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) };
}

function splitOutsideQuotes(text: string, separator: string): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuotes = false;
	for (const c of text) {
		if (c === '"') inQuotes = !inQuotes;
		if (c === separator && !inQuotes) {
			parts.push(current);
			current = '';
		} else {
			current += c;
		}
	}
	parts.push(current);
	return parts;
}

/** Reverses RFC 5545 TEXT escaping. */
function unescapeText(value: string): string {
	return value.replace(/\\([\\;,nN])/g, (_, c: string) =>
		c === 'n' || c === 'N' ? '\n' : c,
	);
}

interface DateValue {
	/** Property-local date. */
	date: IsoDate;
	/** The instant, for date-times with a known zone (for DURATION math). */
	instant: Date | null;
	isDate: boolean;
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function isValidZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function parseDateValue(
	prop: Property,
	timeZone = PROPERTY_TIMEZONE,
): DateValue | null {
	const value = prop.value.trim();
	const dateMatch = DATE_RE.exec(value);
	if (dateMatch || prop.params.VALUE === 'DATE') {
		if (!dateMatch) return null;
		const [, y, m, d] = dateMatch;
		return { date: `${y}-${m}-${d}`, instant: null, isDate: true };
	}
	const dt = DATE_TIME_RE.exec(value);
	if (!dt) return null;
	const [, y, m, d, hh, mm, ss, z] = dt;
	const localDate = `${y}-${m}-${d}`;
	const time = `${hh}:${mm}:${ss}`;
	let instant: Date | null = null;
	if (z === 'Z') {
		instant = new Date(`${localDate}T${time}Z`);
	} else if (prop.params.TZID && isValidZone(prop.params.TZID)) {
		instant = zonedTimeToUtc(localDate, time, prop.params.TZID);
	}
	if (instant && Number.isNaN(instant.getTime())) return null;
	return {
		date: instant ? dateInZone(instant, timeZone) : localDate,
		instant,
		isDate: false,
	};
}

const DURATION_RE =
	/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Duration in ms, or null if invalid. */
export function parseDuration(value: string): number | null {
	const m = DURATION_RE.exec(value.trim());
	if (!m || value.trim() === 'P' || value.trim().endsWith('T')) return null;
	const [, sign, w, d, h, min, s] = m;
	const ms =
		(Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400_000 +
		Number(h ?? 0) * 3_600_000 +
		Number(min ?? 0) * 60_000 +
		Number(s ?? 0) * 1000;
	return sign === '-' ? -ms : ms;
}

/** Our own exported events (see ical-generate.ts): never import them back. */
function isOwnExportUid(uid: string): boolean {
	return /^(booking|block|blocked)-[^@]+@irishette(\.com)?$/i.test(uid);
}

const UNAVAILABLE_SUMMARY =
	/not available|unavailable|blocked|closed|owner|maintenance/i;

function classifySummary(summary: string | null): ImportedEventKind {
	return summary && UNAVAILABLE_SUMMARY.test(summary)
		? 'unavailable'
		: 'reserved';
}

export function parseIcal(
	text: string,
	timeZone = PROPERTY_TIMEZONE,
): ParseResult {
	const result: ParseResult = {
		isCalendar: /BEGIN:VCALENDAR/i.test(text),
		events: [],
		skipped: {
			cancelled: 0,
			noUid: 0,
			ownExport: 0,
			invalidDates: 0,
			duplicateUid: 0,
		},
	};
	const byUid = new Map<string, ImportedEvent>();

	// Properties of the VEVENT being read; nested components (VALARM) ignored.
	let event: Property[] | null = null;
	let nested = 0;

	for (const line of unfoldLines(text)) {
		const prop = parseProperty(line);
		if (!prop) continue;
		if (prop.name === 'BEGIN') {
			if (prop.value.toUpperCase() === 'VEVENT' && !event) {
				event = [];
				nested = 0;
			} else if (event) {
				nested++;
			}
			continue;
		}
		if (prop.name === 'END') {
			if (event && nested > 0) {
				nested--;
			} else if (event && prop.value.toUpperCase() === 'VEVENT') {
				const parsed = toEvent(event, timeZone, result);
				if (parsed) {
					if (byUid.has(parsed.uid)) result.skipped.duplicateUid++;
					byUid.set(parsed.uid, parsed);
				}
				event = null;
			}
			continue;
		}
		if (event && nested === 0) event.push(prop);
	}

	result.events = [...byUid.values()];
	return result;
}

function toEvent(
	props: Property[],
	timeZone: string,
	result: ParseResult,
): ImportedEvent | null {
	const get = (name: string) => props.find((p) => p.name === name);
	const status = get('STATUS')?.value.trim().toUpperCase();
	if (status === 'CANCELLED') {
		result.skipped.cancelled++;
		return null;
	}
	const uid = get('UID')?.value.trim();
	if (!uid) {
		result.skipped.noUid++;
		return null;
	}
	if (isOwnExportUid(uid)) {
		result.skipped.ownExport++;
		return null;
	}

	const dtStart = get('DTSTART');
	const start = dtStart ? parseDateValue(dtStart, timeZone) : null;
	if (!start) {
		result.skipped.invalidDates++;
		return null;
	}

	let end: IsoDate | null = null;
	const dtEnd = get('DTEND');
	const duration = get('DURATION');
	if (dtEnd) {
		end = parseDateValue(dtEnd, timeZone)?.date ?? null;
	} else if (duration) {
		const ms = parseDuration(duration.value);
		if (ms !== null) {
			end =
				start.instant && !start.isDate
					? dateInZone(new Date(start.instant.getTime() + ms), timeZone)
					: addDays(start.date, Math.round(ms / 86_400_000));
		}
	} else if (start.isDate) {
		end = addDays(start.date, 1);
	}
	if (!end || end <= start.date) {
		result.skipped.invalidDates++;
		return null;
	}

	const rawSummary = get('SUMMARY')?.value;
	const summary = rawSummary ? unescapeText(rawSummary).trim() : null;
	return {
		uid,
		start: start.date,
		end,
		kind: classifySummary(summary),
		summary,
	};
}
