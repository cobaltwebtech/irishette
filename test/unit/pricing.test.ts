import { describe, expect, it } from 'vite-plus/test';

import {
	type PricingRule,
	priceNights,
	priceStay,
	roundCents,
	ruleNightPrice,
} from '@/lib/booking/pricing';

const room = {
	basePrice: 100,
	serviceFeeRate: 0.12,
	stateTaxRate: 0.06,
	cityTaxRate: 0.07,
};

const rule = (overrides: Partial<PricingRule> = {}): PricingRule => ({
	id: 'r1',
	name: 'Rule',
	ruleType: 'absolute_price',
	value: 150,
	startDate: '2030-06-08',
	endDate: '2030-06-10',
	isActive: true,
	activatedAt: new Date('2030-01-01T00:00:00Z'),
	...overrides,
});

describe('priceNights', () => {
	it('uses the base price for every night without rules', () => {
		expect(
			priceNights(100, [], '2030-06-01', '2030-06-04').map((n) => n.price),
		).toEqual([100, 100, 100]);
	});

	it('rule Jun 8-10, stay Jun 10-12: night 10 at the rule, 11 at base', () => {
		expect(priceNights(100, [rule()], '2030-06-10', '2030-06-12')).toEqual([
			{ date: '2030-06-10', price: 150, ruleId: 'r1' },
			{ date: '2030-06-11', price: 100, ruleId: null },
		]);
	});

	it('applies a single-night rule (start = end)', () => {
		const single = rule({ startDate: '2030-12-31', endDate: '2030-12-31' });
		expect(
			priceNights(100, [single], '2030-12-30', '2031-01-02').map(
				(n) => n.price,
			),
		).toEqual([100, 150, 100]);
	});

	it('applies a rule that covers only the middle nights', () => {
		const middle = rule({ startDate: '2030-06-11', endDate: '2030-06-12' });
		expect(
			priceNights(100, [middle], '2030-06-10', '2030-06-14').map(
				(n) => n.price,
			),
		).toEqual([100, 150, 150, 100]);
	});

	it('ignores inactive rules', () => {
		expect(
			priceNights(
				100,
				[rule({ isActive: false })],
				'2030-06-08',
				'2030-06-09',
			)[0].price,
		).toBe(100);
	});

	it('earliest activated rule wins on a legacy overlap', () => {
		const late = rule({
			id: 'late',
			value: 300,
			activatedAt: new Date('2030-03-01T00:00:00Z'),
		});
		const early = rule({
			id: 'early',
			value: 200,
			activatedAt: new Date('2030-02-01T00:00:00Z'),
		});
		expect(
			priceNights(100, [late, early], '2030-06-08', '2030-06-09')[0],
		).toEqual({
			date: '2030-06-08',
			price: 200,
			ruleId: 'early',
		});
	});
});

describe('rule types', () => {
	it.each([
		['surcharge_rate', 0.2, 120],
		['fixed_amount', 25, 125],
		['absolute_price', 175, 175],
	])('%s %s → %s', (ruleType, value, price) => {
		expect(ruleNightPrice(100, rule({ ruleType, value }))).toBe(price);
	});

	it('rounds to cents', () => {
		expect(
			ruleNightPrice(99.99, rule({ ruleType: 'surcharge_rate', value: 0.155 })),
		).toBe(115.49);
		expect(roundCents(0.1 + 0.2)).toBe(0.3);
		expect(roundCents(1.005)).toBe(1.01);
	});
});

describe('priceStay', () => {
	it('adds the service fee, and taxes on the room price plus the fee', () => {
		const price = priceStay(room, [], '2030-06-01', '2030-06-04');
		expect(price).toMatchObject({
			numberOfNights: 3,
			baseAmount: 300,
			feesAmount: 36,
			taxAmount: 43.68,
			totalAmount: 379.68,
			appliedRules: [],
		});
		expect(price.taxBreakdown).toMatchObject({
			stateTaxAmount: 20.16,
			cityTaxAmount: 23.52,
			taxableAmount: 336,
		});
	});

	it('reports the rules it applied and their effect', () => {
		const price = priceStay(room, [rule()], '2030-06-09', '2030-06-12');
		expect(price.baseAmount).toBe(400);
		expect(price.appliedRules).toEqual([
			{
				id: 'r1',
				name: 'Rule',
				ruleType: 'absolute_price',
				value: 150,
				nights: 2,
				appliedAmount: 100,
			},
		]);
	});

	it('has no guest-count surcharge (no guest input at all)', () => {
		expect(priceStay.length).toBe(4);
	});

	it('rejects an empty stay', () => {
		expect(() => priceStay(room, [], '2030-06-01', '2030-06-01')).toThrow(
			RangeError,
		);
	});
});
