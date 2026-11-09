// RFC 5545 export feed for one room. Pure.
//
// Contains ONLY our confirmed direct bookings and admin blocks, each as a
// generic "Reserved" all-day event: no names, notes or confirmation ids.
// Imported events are never re-exported (the platforms sync with each other).

import { addDays, type IsoDate } from './date-range';

export interface ExportBooking {
	publicId: string;
	checkInDate: IsoDate;
	checkOutDate: IsoDate; // exclusive
}

export interface ExportBlock {
	id: string;
	startDate: IsoDate; // inclusive
	endDate: IsoDate; // inclusive
}

const ICAL_UID_DOMAIN = 'irishette';

const bookingUid = (publicId: string) =>
	`booking-${publicId}@${ICAL_UID_DOMAIN}`;
const blockUid = (id: string) => `block-${id}@${ICAL_UID_DOMAIN}`;

/** Escapes a TEXT value (backslash, semicolon, comma, newlines). */
export function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Folds a content line at 75 octets (RFC 5545 3.1). Continuation lines start
 * with one space. Never splits a UTF-8 character.
 */
export function foldLine(line: string): string {
	if (encoder.encode(line).length <= 75) return line;
	const out: string[] = [];
	let current = '';
	let currentBytes = 0;
	let limit = 75;
	for (const char of line) {
		const bytes = encoder.encode(char).length;
		if (currentBytes + bytes > limit) {
			out.push(current);
			current = ' ';
			currentBytes = 1;
			limit = 75;
		}
		current += char;
		currentBytes += bytes;
	}
	out.push(current);
	return out.join('\r\n');
}

const compactDate = (date: IsoDate) => date.replaceAll('-', '');

/** `20261107T153000Z` */
function formatUtcStamp(instant: Date): string {
	return `${instant.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function event(
	uid: string,
	start: IsoDate,
	endExclusive: IsoDate,
	stamp: string,
) {
	return [
		'BEGIN:VEVENT',
		`UID:${escapeText(uid)}`,
		`DTSTAMP:${stamp}`,
		`DTSTART;VALUE=DATE:${compactDate(start)}`,
		`DTEND;VALUE=DATE:${compactDate(endExclusive)}`,
		'SUMMARY:Reserved',
		'STATUS:CONFIRMED',
		'TRANSP:OPAQUE',
		'END:VEVENT',
	];
}

export function generateIcal({
	calendarName,
	bookings,
	blocks,
	now = new Date(),
}: {
	calendarName: string;
	bookings: ExportBooking[];
	blocks: ExportBlock[];
	now?: Date;
}): string {
	const stamp = formatUtcStamp(now);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Irishette//Bookings//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(calendarName)}`,
		...bookings.flatMap((b) =>
			event(bookingUid(b.publicId), b.checkInDate, b.checkOutDate, stamp),
		),
		// Blocks are inclusive; DTEND is the day after the last blocked day.
		...blocks.flatMap((b) =>
			event(blockUid(b.id), b.startDate, addDays(b.endDate, 1), stamp),
		),
		'END:VCALENDAR',
	];
	return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
