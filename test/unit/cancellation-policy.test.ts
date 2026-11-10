import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
	cancellationPolicyInputSchema,
	DEFAULT_CANCELLATION_POLICY,
	quoteCancellation,
	refundCutoffs,
} from '@/lib/booking/cancellation-policy';
import { zonedTimeToUtc } from '@/utils/timezone';

// Windows count back from check-in at 4:00 PM CT on the local clock
// (plan 02, 3.5 / 3.9). Check-in Jun 10, 2030 at 16:00 CDT = 21:00Z; the 72 h
// cutoff is Jun 7 16:00 CDT and the 24 h cutoff Jun 9 16:00 CDT.
const CHECK_IN = '2030-06-10';
const at = (iso: string) => new Date(iso);
const second = 1000;

const quote = (
	now: Date,
	{
		amountPaid = 500,
		alreadyRefunded = 0,
		checkInDate = CHECK_IN,
	}: {
		amountPaid?: number;
		alreadyRefunded?: number;
		checkInDate?: string;
	} = {},
) =>
	quoteCancellation({
		policy: DEFAULT_CANCELLATION_POLICY,
		checkInDate,
		amountPaid,
		alreadyRefunded,
		now,
	});

describe('zonedTimeToUtc', () => {
	it('handles CDT and CST', () => {
		expect(zonedTimeToUtc('2030-06-10', '16:00').toISOString()).toBe(
			'2030-06-10T21:00:00.000Z',
		);
		expect(zonedTimeToUtc('2030-01-10', '16:00').toISOString()).toBe(
			'2030-01-10T22:00:00.000Z',
		);
	});
});

describe('quoteCancellation (default policy)', () => {
	const cutoff72 = at('2030-06-07T21:00:00Z');
	const cutoff24 = at('2030-06-09T21:00:00Z');
	const checkIn = at('2030-06-10T21:00:00Z');

	it.each([
		['well before', new Date(cutoff72.getTime() - 86_400_000), 100, 500],
		[
			'1 s before the 72 h cutoff',
			new Date(cutoff72.getTime() - second),
			100,
			500,
		],
		['exactly at the 72 h cutoff (higher refund)', cutoff72, 100, 500],
		[
			'1 s after the 72 h cutoff',
			new Date(cutoff72.getTime() + second),
			50,
			250,
		],
		[
			'1 s before the 24 h cutoff',
			new Date(cutoff24.getTime() - second),
			50,
			250,
		],
		['exactly at the 24 h cutoff', cutoff24, 50, 250],
		['1 s after the 24 h cutoff', new Date(cutoff24.getTime() + second), 0, 0],
		['1 s before check-in', new Date(checkIn.getTime() - second), 0, 0],
	] as const)('%s → %s%% ($%s)', (_label, now, percent, amount) => {
		const q = quote(now);
		expect(q.canCancel).toBe(true);
		expect(q.refundPercent).toBe(percent);
		expect(q.refundAmount).toBe(amount);
	});

	it('cannot cancel from check-in on', () => {
		for (const now of [checkIn, new Date(checkIn.getTime() + 3_600_000)]) {
			const q = quote(now);
			expect(q.canCancel).toBe(false);
			expect(q.tier).toBeNull();
			expect(q.refundAmount).toBe(0);
		}
	});

	it('returns each cutoff as a UTC instant, most notice first', () => {
		expect(
			quote(at('2030-06-01T00:00:00Z')).refundCutoffs.map((c) => [
				c.refundPercent,
				c.until.toISOString(),
			]),
		).toEqual([
			[100, '2030-06-07T21:00:00.000Z'],
			[50, '2030-06-09T21:00:00.000Z'],
			[0, '2030-06-10T21:00:00.000Z'],
		]);
	});

	it('rounds the refund to cents', () => {
		expect(
			quote(at('2030-06-08T12:00:00Z'), { amountPaid: 333.33 }).refundAmount,
		).toBe(166.67);
	});

	it('refunds nothing for an unpaid hold', () => {
		expect(
			quote(at('2030-06-01T00:00:00Z'), { amountPaid: 0 }).refundAmount,
		).toBe(0);
	});

	it('after a partial refund: policy percent of the total, capped at what is still paid', () => {
		// 100% of 500 would be 500, but 400 was already refunded.
		expect(
			quote(at('2030-06-01T00:00:00Z'), { alreadyRefunded: 400 }).refundAmount,
		).toBe(100);
		// 50% of the original 500 = 250, still under the 400 left.
		expect(
			quote(at('2030-06-08T12:00:00Z'), { alreadyRefunded: 100 }).refundAmount,
		).toBe(250);
		// Fully refunded: nothing left.
		expect(
			quote(at('2030-06-01T00:00:00Z'), { alreadyRefunded: 500 }).refundAmount,
		).toBe(0);
	});
});

describe('cutoffs across DST (America/Chicago wall clock)', () => {
	it('check-in on the second Sunday of March: 72 h cutoff stays 4:00 PM local (71 elapsed hours)', () => {
		const [c72, , checkIn] = refundCutoffs(
			DEFAULT_CANCELLATION_POLICY,
			'2030-03-10',
		);
		expect(c72.until.toISOString()).toBe('2030-03-07T22:00:00.000Z'); // 16:00 CST
		expect(checkIn.until.toISOString()).toBe('2030-03-10T21:00:00.000Z'); // 16:00 CDT
		expect((checkIn.until.getTime() - c72.until.getTime()) / 3_600_000).toBe(
			71,
		);
	});

	it('check-in on the first Sunday of November: 72 h cutoff stays 4:00 PM local (73 elapsed hours)', () => {
		const [c72, , checkIn] = refundCutoffs(
			DEFAULT_CANCELLATION_POLICY,
			'2030-11-03',
		);
		expect(c72.until.toISOString()).toBe('2030-10-31T21:00:00.000Z'); // 16:00 CDT
		expect(checkIn.until.toISOString()).toBe('2030-11-03T22:00:00.000Z'); // 16:00 CST
		expect((checkIn.until.getTime() - c72.until.getTime()) / 3_600_000).toBe(
			73,
		);
	});

	it('a 36 h tier is 4:00 AM CT one and a half days before', () => {
		const [c36] = refundCutoffs(
			{
				tiers: [
					{ minHoursBefore: 36, refundPercent: 80 },
					{ minHoursBefore: 0, refundPercent: 0 },
				],
			},
			CHECK_IN,
		);
		expect(c36.until.toISOString()).toBe('2030-06-09T09:00:00.000Z'); // 04:00 CDT
	});
});

describe('server time zone does not matter', () => {
	const original = process.env.TZ;
	afterEach(() => {
		process.env.TZ = original;
	});

	it('gives the same cutoffs with TZ=Asia/Tokyo', () => {
		const utc = quote(at('2030-06-08T12:00:00Z'));
		process.env.TZ = 'Asia/Tokyo';
		const tokyo = quote(at('2030-06-08T12:00:00Z'));
		expect(tokyo.checkInAt.toISOString()).toBe('2030-06-10T21:00:00.000Z');
		expect(tokyo.refundCutoffs).toEqual(utc.refundCutoffs);
		expect(tokyo.refundPercent).toBe(utc.refundPercent);
	});
});

describe('cancellationPolicyInputSchema', () => {
	const valid = {
		name: 'Strict',
		tiers: [
			{ minHoursBefore: 168, refundPercent: 100 },
			{ minHoursBefore: 0, refundPercent: 0 },
		],
	};

	it('accepts a valid policy', () => {
		expect(cancellationPolicyInputSchema.safeParse(valid).success).toBe(true);
	});

	it.each([
		['no 0-hour tier', { tiers: [{ minHoursBefore: 24, refundPercent: 50 }] }],
		[
			'duplicate hours',
			{
				tiers: [
					{ minHoursBefore: 0, refundPercent: 0 },
					{ minHoursBefore: 0, refundPercent: 10 },
				],
			},
		],
		[
			'later cancellations refund more',
			{
				tiers: [
					{ minHoursBefore: 72, refundPercent: 50 },
					{ minHoursBefore: 0, refundPercent: 100 },
				],
			},
		],
		['percent > 100', { tiers: [{ minHoursBefore: 0, refundPercent: 101 }] }],
	])('rejects %s', (_label, overrides) => {
		expect(
			cancellationPolicyInputSchema.safeParse({ ...valid, ...overrides })
				.success,
		).toBe(false);
	});
});
