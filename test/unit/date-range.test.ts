import { describe, expect, it } from 'vite-plus/test';

import {
	addDays,
	daysBetween,
	isCheckInDisabled,
	isCheckOutAllowed,
	isIsoDate,
	isStayAvailable,
	stayNights,
	stayOverlapsBlock,
	stayOverlapsEvent,
	stayOverlapsStay,
	type Unavailability,
} from '@/lib/date-range';

const stay = (checkIn: string, checkOut: string) => ({ checkIn, checkOut });

describe('date helpers', () => {
	it('validates real dates', () => {
		expect(isIsoDate('2030-02-28')).toBe(true);
		expect(isIsoDate('2030-02-29')).toBe(false);
		expect(isIsoDate('2032-02-29')).toBe(true);
		expect(isIsoDate('2030-6-1')).toBe(false);
	});

	it('adds days across months, years and DST', () => {
		expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
		expect(addDays('2030-12-31', 1)).toBe('2031-01-01');
		expect(addDays('2030-03-10', 1)).toBe('2030-03-11');
		expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
		expect(daysBetween('2030-03-09', '2030-03-12')).toBe(3);
	});

	it('lists the nights of a stay (check-out excluded)', () => {
		expect(stayNights('2030-06-10', '2030-06-12')).toEqual([
			'2030-06-10',
			'2030-06-11',
		]);
		expect(stayNights('2030-06-10', '2030-06-10')).toEqual([]);
	});
});

describe('stay vs stay (bookings and holds)', () => {
	const existing = stay('2030-06-10', '2030-06-12');

	it('allows same-day turnover in both directions', () => {
		expect(stayOverlapsStay(stay('2030-06-12', '2030-06-14'), existing)).toBe(
			false,
		);
		expect(stayOverlapsStay(stay('2030-06-08', '2030-06-10'), existing)).toBe(
			false,
		);
	});

	it('rejects partial and contained overlaps', () => {
		expect(stayOverlapsStay(stay('2030-06-11', '2030-06-14'), existing)).toBe(
			true,
		);
		expect(stayOverlapsStay(stay('2030-06-08', '2030-06-11'), existing)).toBe(
			true,
		);
		expect(stayOverlapsStay(stay('2030-06-09', '2030-06-13'), existing)).toBe(
			true,
		);
		expect(stayOverlapsStay(stay('2030-06-10', '2030-06-11'), existing)).toBe(
			true,
		);
	});
});

describe('stay vs imported event (end exclusive)', () => {
	const event = { start: '2030-06-10', end: '2030-06-12' };
	it('allows check-in on the end date and check-out on the start date', () => {
		expect(stayOverlapsEvent(stay('2030-06-12', '2030-06-13'), event)).toBe(
			false,
		);
		expect(stayOverlapsEvent(stay('2030-06-09', '2030-06-10'), event)).toBe(
			false,
		);
		expect(stayOverlapsEvent(stay('2030-06-11', '2030-06-13'), event)).toBe(
			true,
		);
	});
});

describe('stay vs admin block Jun 8-10 (inclusive)', () => {
	const block = { start: '2030-06-08', end: '2030-06-10' };
	it.each([
		['check-in on the last day', '2030-06-10', '2030-06-11', true],
		['check-in the day after', '2030-06-11', '2030-06-12', false],
		['check-out on the first day (Jun 7-8)', '2030-06-07', '2030-06-08', false],
		['stay into the block (Jun 7-9)', '2030-06-07', '2030-06-09', true],
		['one night inside', '2030-06-09', '2030-06-10', true],
		['stay around the block', '2030-06-05', '2030-06-15', true],
	])('%s', (_label, checkIn, checkOut, overlaps) => {
		expect(stayOverlapsBlock(stay(checkIn, checkOut), block)).toBe(overlaps);
	});
});

describe('calendar rules match the server rules', () => {
	const u: Unavailability = {
		stays: [stay('2030-06-20', '2030-06-22')],
		events: [{ start: '2030-06-25', end: '2030-06-27' }],
		blocks: [{ start: '2030-06-08', end: '2030-06-10' }],
	};

	it('disables check-in on unavailable nights only', () => {
		expect(isCheckInDisabled('2030-06-07', u)).toBe(false);
		expect(isCheckInDisabled('2030-06-08', u)).toBe(true);
		expect(isCheckInDisabled('2030-06-10', u)).toBe(true);
		expect(isCheckInDisabled('2030-06-11', u)).toBe(false);
		expect(isCheckInDisabled('2030-06-20', u)).toBe(true);
		expect(isCheckInDisabled('2030-06-22', u)).toBe(false);
		expect(isCheckInDisabled('2030-06-26', u)).toBe(true);
		expect(isCheckInDisabled('2030-06-27', u)).toBe(false);
	});

	it('allows check-out on a booking’s check-in day or a block’s first day', () => {
		expect(isCheckOutAllowed('2030-06-18', '2030-06-20', u)).toBe(true);
		expect(isCheckOutAllowed('2030-06-07', '2030-06-08', u)).toBe(true);
		expect(isCheckOutAllowed('2030-06-18', '2030-06-21', u)).toBe(false);
		expect(isCheckOutAllowed('2030-06-07', '2030-06-09', u)).toBe(false);
	});

	it('agrees with isStayAvailable for every stay in a month', () => {
		const days = Array.from({ length: 30 }, (_, i) => addDays('2030-06-01', i));
		for (const checkIn of days) {
			for (const checkOut of days.filter((d) => d > checkIn)) {
				const calendar =
					!isCheckInDisabled(checkIn, u) &&
					isCheckOutAllowed(checkIn, checkOut, u);
				expect(calendar, `${checkIn}..${checkOut}`).toBe(
					isStayAvailable(stay(checkIn, checkOut), u),
				);
			}
		}
	});
});
