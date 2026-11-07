import { describe, expect, it } from 'vite-plus/test';

import { parseDuration, parseIcal, unfoldLines } from '@/lib/ical-parse';

const cal = (...events: string[][]) =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
		'END:VCALENDAR',
	].join('\r\n');

// Shapes of the real feeds (synthetic data).
const AIRBNB = [
	'BEGIN:VCALENDAR',
	'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
	'CALSCALE:GREGORIAN',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'DTEND;VALUE=DATE:20300612',
	'DTSTART;VALUE=DATE:20300610',
	'UID:1418fb94e984-0123456789abcdef0123456789abcdef@airbnb.com',
	'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/',
	' details/HMXXXXXXXX\\nPhone Number (Last 4 Digits): 0000',
	'SUMMARY:Reserved',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'DTEND;VALUE=DATE:20300620',
	'DTSTART;VALUE=DATE:20300618',
	'UID:7f0123456789-fedcba9876543210fedcba9876543210@airbnb.com',
	'SUMMARY:Airbnb (Not available)',
	'END:VEVENT',
	'END:VCALENDAR',
	'',
].join('\r\n');

const EXPEDIA = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//Expedia Group//Lodging Calendar//EN',
	'BEGIN:VEVENT',
	'UID:expedia-res-0001',
	'DTSTAMP:20300101T000000Z',
	'DTSTART;VALUE=DATE:20300701',
	'DTEND;VALUE=DATE:20300704',
	'SUMMARY:Reserved - Expedia',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'UID:expedia-blk-0002',
	'DTSTART;VALUE=DATE:20300710',
	'DTEND;VALUE=DATE:20300711',
	'SUMMARY:Unavailable on Expedia',
	'END:VEVENT',
	'END:VCALENDAR',
].join('\n');

describe('parseIcal', () => {
	it('reads an Airbnb feed (CRLF, folded description, host block)', () => {
		const { isCalendar, events } = parseIcal(AIRBNB);
		expect(isCalendar).toBe(true);
		expect(events).toEqual([
			{
				uid: '1418fb94e984-0123456789abcdef0123456789abcdef@airbnb.com',
				start: '2030-06-10',
				end: '2030-06-12',
				kind: 'reserved',
				summary: 'Reserved',
			},
			{
				uid: '7f0123456789-fedcba9876543210fedcba9876543210@airbnb.com',
				start: '2030-06-18',
				end: '2030-06-20',
				kind: 'unavailable',
				summary: 'Airbnb (Not available)',
			},
		]);
	});

	it('reads an Expedia feed (LF line endings)', () => {
		const { events } = parseIcal(EXPEDIA);
		expect(events.map((e) => [e.uid, e.start, e.end, e.kind])).toEqual([
			['expedia-res-0001', '2030-07-01', '2030-07-04', 'reserved'],
			['expedia-blk-0002', '2030-07-10', '2030-07-11', 'unavailable'],
		]);
	});

	it('unfolds folded UIDs', () => {
		const { events } = parseIcal(
			cal([
				'UID:folded-1234567890',
				' abcdef@airbnb.test',
				'DTSTART;VALUE=DATE:20300301',
				'DTEND;VALUE=DATE:20300303',
			]),
		);
		expect(events[0].uid).toBe('folded-1234567890abcdef@airbnb.test');
	});

	it('converts UTC near midnight to the Chicago date', () => {
		const { events } = parseIcal(
			cal(['UID:utc', 'DTSTART:20300411T030000Z', 'DTEND:20300413T030000Z']),
		);
		expect(events[0]).toMatchObject({ start: '2030-04-10', end: '2030-04-12' });
	});

	it('reads TZID date-times in that zone', () => {
		const { events } = parseIcal(
			cal([
				'UID:tz',
				'DTSTART;TZID=America/New_York:20300510T003000',
				'DTEND;TZID=America/New_York:20300512T110000',
			]),
		);
		// 00:30 New York on May 10 is 23:30 Chicago on May 9.
		expect(events[0]).toMatchObject({ start: '2030-05-09', end: '2030-05-12' });
	});

	it('uses DURATION when there is no DTEND', () => {
		const { events } = parseIcal(
			cal(['UID:d', 'DTSTART;VALUE=DATE:20300610', 'DURATION:P3D']),
		);
		expect(events[0]).toMatchObject({ start: '2030-06-10', end: '2030-06-13' });
	});

	it('treats a DATE event without DTEND as one day', () => {
		const { events } = parseIcal(
			cal(['UID:one', 'DTSTART;VALUE=DATE:20300710']),
		);
		expect(events[0]).toMatchObject({ start: '2030-07-10', end: '2030-07-11' });
	});

	it('skips cancelled, UID-less, own-export and empty events', () => {
		const result = parseIcal(
			cal(
				['UID:c', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20300801'],
				['DTSTART;VALUE=DATE:20300801', 'DTEND;VALUE=DATE:20300802'],
				[
					'UID:booking-abcdefghij012345@irishette',
					'DTSTART;VALUE=DATE:20300801',
					'DTEND;VALUE=DATE:20300802',
				],
				[
					'UID:blocked-old@irishette.com',
					'DTSTART;VALUE=DATE:20300801',
					'DTEND;VALUE=DATE:20300802',
				],
				['UID:empty', 'DTSTART:20300801T150000Z', 'DTEND:20300801T160000Z'],
			),
		);
		expect(result.events).toEqual([]);
		expect(result.skipped).toMatchObject({
			cancelled: 1,
			noUid: 1,
			ownExport: 2,
			invalidDates: 1,
		});
	});

	it('keeps the last copy of a duplicate UID', () => {
		const result = parseIcal(
			cal(
				['UID:dup', 'DTSTART;VALUE=DATE:20300801', 'DTEND;VALUE=DATE:20300802'],
				['UID:dup', 'DTSTART;VALUE=DATE:20300803', 'DTEND;VALUE=DATE:20300805'],
			),
		);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].start).toBe('2030-08-03');
		expect(result.skipped.duplicateUid).toBe(1);
	});

	it('ignores nested components (VALARM)', () => {
		const { events } = parseIcal(
			cal([
				'UID:alarm',
				'DTSTART;VALUE=DATE:20300901',
				'BEGIN:VALARM',
				'TRIGGER:-PT15M',
				'DESCRIPTION:x',
				'END:VALARM',
				'DTEND;VALUE=DATE:20300902',
			]),
		);
		expect(events).toHaveLength(1);
	});

	it('recognizes non-calendars', () => {
		expect(parseIcal('<html><body>Sign in</body></html>')).toMatchObject({
			isCalendar: false,
			events: [],
		});
	});
});

describe('helpers', () => {
	it('unfolds with spaces and tabs', () => {
		expect(unfoldLines('A:1\r\n 2\r\n\t3\nB:4')).toEqual(['A:123', 'B:4']);
	});

	it('parses durations', () => {
		expect(parseDuration('P2D')).toBe(2 * 86_400_000);
		expect(parseDuration('P1W')).toBe(7 * 86_400_000);
		expect(parseDuration('PT1H30M')).toBe(90 * 60_000);
		expect(parseDuration('P')).toBeNull();
		expect(parseDuration('nonsense')).toBeNull();
	});
});
