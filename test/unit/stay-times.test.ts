import { describe, expect, it } from 'vite-plus/test';

import { addMonths, lastBookableDate } from '@/lib/date-range';
import {
	checkInAt,
	checkOutAt,
	earliestCheckInDate,
	localCutoff,
	stayPhase,
} from '@/lib/stay-times';
import { isPricingComplete } from '@/utils/booking-utils';

// Fixed check-in 4:00 PM and check-out 11:00 AM America/Chicago, stored as
// UTC instants (plan 02, 3.9). The unit project runs with TZ=UTC.

describe('checkInAt / checkOutAt', () => {
	it('4:00 PM CT: 21:00Z in summer (CDT), 22:00Z in winter (CST)', () => {
		expect(checkInAt('2030-06-10').toISOString()).toBe(
			'2030-06-10T21:00:00.000Z',
		);
		expect(checkInAt('2030-01-10').toISOString()).toBe(
			'2030-01-10T22:00:00.000Z',
		);
	});

	it('11:00 AM CT check-out', () => {
		expect(checkOutAt('2030-06-12').toISOString()).toBe(
			'2030-06-12T16:00:00.000Z',
		);
		expect(checkOutAt('2030-01-12').toISOString()).toBe(
			'2030-01-12T17:00:00.000Z',
		);
	});

	it('DST days: second Sunday of March and first Sunday of November', () => {
		expect(checkInAt('2030-03-10').toISOString()).toBe(
			'2030-03-10T21:00:00.000Z',
		);
		expect(checkInAt('2030-11-03').toISOString()).toBe(
			'2030-11-03T22:00:00.000Z',
		);
	});
});

describe('localCutoff', () => {
	it('counts whole days on the calendar and the rest on the clock', () => {
		expect(localCutoff('2030-06-10', '16:00', 0).toISOString()).toBe(
			'2030-06-10T21:00:00.000Z',
		);
		expect(localCutoff('2030-06-10', '16:00', 24).toISOString()).toBe(
			'2030-06-09T21:00:00.000Z',
		);
		// 20 h before 4:00 PM is 8:00 PM the day before.
		expect(localCutoff('2030-06-10', '16:00', 20).toISOString()).toBe(
			'2030-06-10T01:00:00.000Z',
		);
	});
});

describe('earliestCheckInDate (same-day cutoff 9:00 AM CT)', () => {
	it.each([
		['08:59 CDT', '2030-06-10T13:59:00Z', '2030-06-10'],
		['09:00 CDT', '2030-06-10T14:00:00Z', '2030-06-11'],
		['08:59 CST', '2030-01-10T14:59:00Z', '2030-01-10'],
		['09:00 CST', '2030-01-10T15:00:00Z', '2030-01-11'],
		// The morning DST starts (2:00 AM jumps to 3:00 AM).
		['08:59 on the DST day', '2030-03-10T13:59:00Z', '2030-03-10'],
		['09:00 on the DST day', '2030-03-10T14:00:00Z', '2030-03-11'],
		// Late evening CT is already the next day in UTC.
		['11:30 PM CT', '2030-06-11T04:30:00Z', '2030-06-11'],
	])('%s → %s', (_label, now, expected) => {
		expect(earliestCheckInDate(new Date(now))).toBe(expected);
	});
});

describe('stayPhase', () => {
	const stay = {
		checkInAt: checkInAt('2030-06-10'),
		checkOutAt: checkOutAt('2030-06-12'),
	};
	it.each([
		['1 s before check-in', '2030-06-10T20:59:59Z', 'upcoming'],
		['at check-in (4:00 PM CT)', '2030-06-10T21:00:00Z', 'in_stay'],
		['1 s before check-out', '2030-06-12T15:59:59Z', 'in_stay'],
		['at check-out (11:00 AM CT)', '2030-06-12T16:00:00Z', 'past'],
	] as const)('%s → %s', (_label, now, phase) => {
		expect(stayPhase(stay, new Date(now))).toBe(phase);
	});
});

describe('booking window', () => {
	it('adds calendar months, clamped to the month end', () => {
		expect(addMonths('2030-01-31', 1)).toBe('2030-02-28');
		expect(addMonths('2030-03-15', 10)).toBe('2031-01-15');
		expect(lastBookableDate('2030-06-10')).toBe('2031-04-10');
	});
});

describe('isPricingComplete', () => {
	const base = {
		baseAmount: 200,
		feesAmount: 24,
		taxAmount: 26,
		totalAmount: 250,
		numberOfNights: 2,
	};
	it('accepts zero fees and taxes (rooms without them)', () => {
		expect(
			isPricingComplete({
				...base,
				feesAmount: 0,
				taxAmount: 0,
				totalAmount: 200,
			}),
		).toBe(true);
	});
	it('rejects missing values', () => {
		expect(isPricingComplete({ ...base, taxAmount: undefined })).toBe(false);
		expect(isPricingComplete({ ...base, numberOfNights: 0 })).toBe(false);
	});
});

describe('display formatters (US Central Time, en-US)', () => {
	const original = process.env.TZ;

	it('stay dates are calendar dates, the same in every time zone', async () => {
		const { formatStayDate } = await import('@/lib/timezone');
		for (const tz of ['UTC', 'Asia/Tokyo', 'Pacific/Honolulu']) {
			process.env.TZ = tz;
			expect(formatStayDate('2030-06-10')).toBe('Jun 10, 2030');
			expect(formatStayDate('2030-06-10', 'full')).toBe(
				'Monday, June 10, 2030',
			);
			expect(formatStayDate('2030-06-10', 'mediumWeekday')).toBe(
				'Mon, Jun 10, 2030',
			);
		}
		process.env.TZ = original;
	});

	it('instants are shown in Central Time', async () => {
		const { formatDateCT, formatDateTimeCT, yearCT } =
			await import('@/lib/timezone');
		// 03:30Z on Jun 11 is still Jun 10 (10:30 PM CDT) at the property.
		expect(formatDateCT('2030-06-11T03:30:00Z')).toBe('Jun 10, 2030');
		expect(formatDateTimeCT('2030-06-11T03:30:00Z')).toBe(
			'Jun 10, 2030, 10:30 PM CT',
		);
		expect(formatDateTimeCT('2030-01-11T03:30:00Z')).toBe(
			'Jan 10, 2030, 9:30 PM CT',
		);
		expect(yearCT('2031-01-01T03:00:00Z')).toBe('2030');
	});
});
