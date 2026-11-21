import { describe, expect, it } from 'vite-plus/test';

import {
	divideSplit,
	policyRefundCents,
	refundSplitTaxFirst,
	taxDueOnKept,
} from '@/lib/booking/tax-split';

// Texas hotel tax on cancellations (Comptroller quick reference, "Room
// Cancellation Fee"): tax is due on kept money only when the full room rate
// is kept within 30 days of the stay; a percentage kept is not taxable.

const paid = {
	room: 200,
	fees: 24,
	taxable: 224,
	stateTax: 13.44,
	cityTax: 15.68,
};
const checkInAt = new Date('2030-06-10T21:00:00Z');
const daysBefore = (days: number) =>
	new Date(checkInAt.getTime() - days * 86_400_000);

describe('taxDueOnKept', () => {
	it.each([
		['full rate kept 2 days out', 0, 2, true],
		['full rate kept exactly 30 days out', 0, 30, true],
		['full rate kept 31 days out', 0, 31, false],
		['a percentage refunded 5 days out', 75, 5, false],
		['everything refunded', 100, 10, false],
	])('%s', (_label, percent, days, expected) => {
		expect(taxDueOnKept(percent, checkInAt, daysBefore(days))).toBe(expected);
	});
});

describe('policyRefundCents', () => {
	it('75%: 75% of room and fee plus all the tax', () => {
		expect(policyRefundCents(paid, 75, false)).toBe(16800 + 2912);
	});
	it('0% with the tax due: nothing', () => {
		expect(policyRefundCents(paid, 0, true)).toBe(0);
	});
	it('0% more than 30 days out: the tax only', () => {
		expect(policyRefundCents(paid, 0, false)).toBe(2912);
	});
	it('100%: everything', () => {
		expect(policyRefundCents(paid, 100, false)).toBe(25312);
	});
});

describe('refundSplitTaxFirst', () => {
	it('returns the tax first, then room and fee in proportion', () => {
		expect(refundSplitTaxFirst(paid, 19712)).toEqual({
			room: 150,
			fees: 18,
			taxable: 224,
			stateTax: 13.44,
			cityTax: 15.68,
		});
	});
	it('caps at the pool and handles a tax-only refund', () => {
		expect(refundSplitTaxFirst(paid, 99_999)).toEqual(paid);
		expect(refundSplitTaxFirst(paid, 2912)).toMatchObject({
			room: 0,
			fees: 0,
			taxable: 224,
		});
	});
});

describe('divideSplit', () => {
	it('divides by amount and the parts add up exactly', () => {
		const parts = divideSplit(paid, [15000, 10312]);
		const sum = (key: keyof typeof paid) =>
			Math.round(parts.reduce((s, p) => s + p[key] * 100, 0));
		for (const key of Object.keys(paid) as (keyof typeof paid)[]) {
			expect(sum(key)).toBe(Math.round(paid[key] * 100));
		}
	});
});
