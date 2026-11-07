import { describe, expect, it } from 'vitest';
import {
	cancellationPolicyInputSchema,
	DEFAULT_CANCELLATION_POLICY,
	quoteCancellation,
} from '@/lib/cancellation-policy';
import { zonedTimeToUtc } from '@/lib/timezone';

// Check-in Jun 10, 2030 at 16:00 Central (CDT, UTC-5) = 21:00Z.
const CHECK_IN = '2030-06-10';
const hoursBefore = (h: number) =>
	new Date(Date.parse('2030-06-10T21:00:00Z') - h * 3_600_000);

const quote = (now: Date, amountPaid = 500) =>
	quoteCancellation({
		policy: DEFAULT_CANCELLATION_POLICY,
		checkInDate: CHECK_IN,
		amountPaid,
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
	it.each([
		[100, 100, 500],
		[72, 100, 500],
		[71.9, 50, 250],
		[24, 50, 250],
		[23.9, 0, 0],
		[0.1, 0, 0],
	])('%s h before check-in → %s%% ($%s)', (hours, percent, amount) => {
		const q = quote(hoursBefore(hours));
		expect(q.canCancel).toBe(true);
		expect(q.refundPercent).toBe(percent);
		expect(q.refundAmount).toBe(amount);
	});

	it('cannot cancel after check-in time', () => {
		const q = quote(hoursBefore(-1));
		expect(q.canCancel).toBe(false);
		expect(q.refundAmount).toBe(0);
	});

	it('rounds the refund to cents', () => {
		expect(quote(hoursBefore(30), 333.33).refundAmount).toBe(166.67);
	});

	it('refunds nothing for an unpaid hold', () => {
		expect(quote(hoursBefore(100), 0).refundAmount).toBe(0);
	});
});

describe('cancellationPolicyInputSchema', () => {
	const valid = {
		name: 'Strict',
		checkInTime: '15:00',
		timezone: 'America/Chicago',
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
		['bad time', { checkInTime: '4pm' }],
		['bad timezone', { timezone: 'Mars/Olympus' }],
		['percent > 100', { tiers: [{ minHoursBefore: 0, refundPercent: 101 }] }],
	])('rejects %s', (_label, overrides) => {
		expect(
			cancellationPolicyInputSchema.safeParse({ ...valid, ...overrides })
				.success,
		).toBe(false);
	});
});
