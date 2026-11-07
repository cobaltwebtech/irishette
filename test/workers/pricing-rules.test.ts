import { describe, expect, it } from 'vite-plus/test';

import { caller, causeField, insertPricingRule, trpcError } from './helpers';
import { ROSE } from './seed';

// Rules: inclusive start/end; active rules in a room may not overlap
// (a.start <= b.end AND b.start <= a.end); inactive rules are ignored by the
// check; reactivation re-checks. Conflicts are CONFLICT with data.conflict.

const admin = () => caller('admin');

const ruleInput = (
	overrides: Partial<{
		name: string;
		startDate: string;
		endDate: string;
		isActive: boolean;
	}> = {},
) => ({
	roomId: ROSE.id,
	name: 'Summer',
	ruleType: 'absolute_price' as const,
	value: 150,
	startDate: '2030-06-08',
	endDate: '2030-06-10',
	isActive: true,
	...overrides,
});

describe('pricing rule overlap', () => {
	it('allows a single-night rule (start = end)', async () => {
		const rule = await admin().rooms.createPricingRule(
			ruleInput({ startDate: '2030-08-01', endDate: '2030-08-01' }),
		);
		expect(rule.startDate).toBe(rule.endDate);
	});

	it('allows adjacent, non-overlapping rules', async () => {
		await admin().rooms.createPricingRule(
			ruleInput({ startDate: '2030-09-01', endDate: '2030-09-05' }),
		);
		await expect(
			admin().rooms.createPricingRule(
				ruleInput({ startDate: '2030-09-06', endDate: '2030-09-08' }),
			),
		).resolves.toBeTruthy();
	});

	it('rejects an overlapping active rule on create with CONFLICT details', async () => {
		const existing = await insertPricingRule({
			name: 'Existing',
			startDate: '2030-06-08',
			endDate: '2030-06-10',
		});
		const error = await trpcError(
			admin().rooms.createPricingRule(
				ruleInput({ startDate: '2030-06-10', endDate: '2030-06-12' }),
			),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflict')).toMatchObject({
			id: existing.id,
			name: 'Existing',
			startDate: '2030-06-08',
			endDate: '2030-06-10',
		});
	});

	it('rejects an overlapping active rule on update', async () => {
		await insertPricingRule({
			name: 'Existing',
			startDate: '2030-10-08',
			endDate: '2030-10-10',
		});
		const other = await insertPricingRule({
			name: 'Other',
			startDate: '2030-10-20',
			endDate: '2030-10-22',
		});
		const error = await trpcError(
			admin().rooms.updatePricingRule({
				id: other.id,
				startDate: '2030-10-09',
			}),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflict')).toMatchObject({ name: 'Existing' });
	});

	it('allows an overlapping rule while it is inactive', async () => {
		await insertPricingRule({
			startDate: '2030-11-08',
			endDate: '2030-11-10',
		});
		const inactive = await admin().rooms.createPricingRule(
			ruleInput({
				startDate: '2030-11-09',
				endDate: '2030-11-12',
				isActive: false,
			}),
		);
		expect(inactive.isActive).toBe(false);
	});

	it('rejects reactivating an overlapping rule', async () => {
		await insertPricingRule({
			name: 'Active',
			startDate: '2031-01-08',
			endDate: '2031-01-10',
		});
		const inactive = await insertPricingRule({
			name: 'Inactive',
			startDate: '2031-01-09',
			endDate: '2031-01-12',
			isActive: false,
			activatedAt: null,
		});
		const error = await trpcError(
			admin().rooms.updatePricingRule({ id: inactive.id, isActive: true }),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflict')).toMatchObject({ name: 'Active' });
	});

	it('two concurrent overlapping creates: only one succeeds', async () => {
		const results = await Promise.allSettled([
			admin().rooms.createPricingRule(
				ruleInput({
					name: 'A',
					startDate: '2031-02-01',
					endDate: '2031-02-05',
				}),
			),
			admin().rooms.createPricingRule(
				ruleInput({
					name: 'B',
					startDate: '2031-02-03',
					endDate: '2031-02-07',
				}),
			),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((r) => r.status === 'rejected');
		expect((rejected as PromiseRejectedResult).reason.code).toBe('CONFLICT');
	});

	it('sets activatedAt when a rule is reactivated', async () => {
		const rule = await insertPricingRule({
			startDate: '2031-03-01',
			endDate: '2031-03-02',
			isActive: false,
			activatedAt: null,
		});
		const updated = await admin().rooms.updatePricingRule({
			id: rule.id,
			isActive: true,
		});
		expect(updated.activatedAt).toBeInstanceOf(Date);
	});
});

describe('pricing per night (calendar and checkout)', () => {
	// Rule Jun 8-10 (inclusive), stay Jun 10-12: night of the 10th at the
	// rule price (150), night of the 11th at the base price (100).
	it('calendar prices each night independently', async () => {
		await insertPricingRule({
			startDate: '2032-06-08',
			endDate: '2032-06-10',
			value: 150,
		});
		const pricing = await caller(null).rooms.calculatePricing({
			roomId: ROSE.id,
			checkInDate: '2032-06-10',
			checkOutDate: '2032-06-12',
			guestCount: 1,
		});
		expect(pricing.baseAmount).toBe(250);
	});

	it('checkout prices each night independently', async () => {
		await insertPricingRule({
			startDate: '2032-07-08',
			endDate: '2032-07-10',
			value: 150,
		});
		const pricing = await caller(null).bookings.calculateBooking({
			roomId: ROSE.id,
			checkInDate: '2032-07-10',
			checkOutDate: '2032-07-12',
			guestCount: 1,
		});
		expect(pricing.baseAmount).toBe(250);
	});

	it('uses the base price for every night when no rule applies', async () => {
		const calendar = await caller(null).rooms.calculatePricing({
			roomId: ROSE.id,
			checkInDate: '2032-08-01',
			checkOutDate: '2032-08-04',
			guestCount: 1,
		});
		const checkout = await caller(null).bookings.calculateBooking({
			roomId: ROSE.id,
			checkInDate: '2032-08-01',
			checkOutDate: '2032-08-04',
			guestCount: 1,
		});
		expect(calendar.baseAmount).toBe(300);
		expect(checkout.baseAmount).toBe(300);
		// 12% fee, 6% + 7% tax on the room price.
		expect(checkout.feesAmount).toBe(36);
		expect(checkout.taxAmount).toBe(39);
		expect(checkout.totalAmount).toBe(375);
	});
});
