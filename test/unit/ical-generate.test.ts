import { describe, expect, it } from 'vitest';
import { escapeText, foldLine, generateIcal } from '@/lib/ical-generate';
import { parseIcal, unfoldLines } from '@/lib/ical-parse';

const NOW = new Date('2030-01-02T03:04:05Z');

const feed = () =>
	generateIcal({
		calendarName: 'Irishette, Rose Room',
		bookings: [
			{
				publicId: 'abcdefghij012345',
				checkInDate: '2030-06-10',
				checkOutDate: '2030-06-12',
			},
		],
		blocks: [{ id: 'blk-1', startDate: '2030-06-20', endDate: '2030-06-22' }],
		now: NOW,
	});

describe('generateIcal', () => {
	it('has the required headers and CRLF line endings', () => {
		const text = feed();
		expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
		expect(text).toContain('\r\nPRODID:-//Irishette//Bookings//EN\r\n');
		expect(text).toContain('\r\nCALSCALE:GREGORIAN\r\n');
		expect(text).toContain('\r\nMETHOD:PUBLISH\r\n');
		expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
	});

	it('uses check-out as the booking DTEND and end + 1 for blocks', () => {
		const text = feed();
		expect(text).toContain(
			'DTSTART;VALUE=DATE:20300610\r\nDTEND;VALUE=DATE:20300612',
		);
		expect(text).toContain(
			'DTSTART;VALUE=DATE:20300620\r\nDTEND;VALUE=DATE:20300623',
		);
	});

	it('uses stable UIDs, DTSTAMP and a generic summary', () => {
		const text = feed();
		expect(text).toContain('UID:booking-abcdefghij012345@irishette');
		expect(text).toContain('UID:block-blk-1@irishette');
		expect(text).toContain('DTSTAMP:20300102T030405Z');
		expect(text.match(/^SUMMARY:.*$/gm)).toEqual([
			'SUMMARY:Reserved',
			'SUMMARY:Reserved',
		]);
		expect(text).not.toMatch(/DESCRIPTION|ATTENDEE|ORGANIZER/);
	});

	it('escapes the calendar name', () => {
		expect(feed()).toContain('X-WR-CALNAME:Irishette\\, Rose Room');
	});

	it('round-trips through the parser (which skips our own UIDs)', () => {
		const parsed = parseIcal(feed());
		expect(parsed.isCalendar).toBe(true);
		expect(parsed.events).toEqual([]);
		expect(parsed.skipped.ownExport).toBe(2);
	});
});

describe('escapeText', () => {
	it('escapes \\ ; , and newlines (no event injection)', () => {
		const evil = 'Name; x, y\\z\r\nEND:VEVENT\nBEGIN:VEVENT';
		const escaped = escapeText(evil);
		expect(escaped).toBe('Name\\; x\\, y\\\\z\\nEND:VEVENT\\nBEGIN:VEVENT');
		expect(escaped).not.toMatch(/[\r\n]/);
	});
});

describe('foldLine', () => {
	it('folds at 75 octets and unfolds back', () => {
		const line = `X-WR-CALNAME:${'é'.repeat(80)}`;
		const folded = foldLine(line);
		for (const part of folded.split('\r\n')) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		}
		expect(unfoldLines(folded)).toEqual([line]);
	});

	it('leaves short lines alone', () => {
		expect(foldLine('SUMMARY:Reserved')).toBe('SUMMARY:Reserved');
	});
});
