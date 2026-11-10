import { describe, expect, it } from 'vite-plus/test';

import { redirectSearchParam } from '@/lib/auth/redirect';
import {
	confirmCheckoutSchema,
	createBookingSchema,
} from '@/lib/booking/payment-validation';
import {
	createPricingRuleSchema,
	createRoomSchema,
	updatePricingRuleSchema,
	updateRoomSchema,
} from '@/lib/booking/room-validation';
import { publicIdSchema } from '@/utils/ids';

const rule = {
	roomId: 'room-1',
	name: 'Holiday',
	ruleType: 'absolute_price' as const,
	value: 150,
	startDate: '2030-06-08',
	endDate: '2030-06-10',
	isActive: true,
};

describe('room fee and tax rates', () => {
	const room = { name: 'Rose Room', slug: 'rose-room', basePrice: 120 };

	it('accepts 0% service fee and taxes', () => {
		const result = createRoomSchema.safeParse({
			...room,
			serviceFeeRate: 0,
			stateTaxRate: 0,
			cityTaxRate: 0,
		});
		expect(result.success).toBe(true);
		expect(
			updateRoomSchema.safeParse({
				id: 'room-1',
				serviceFeeRate: 0,
				stateTaxRate: 0,
				cityTaxRate: 0,
			}).success,
		).toBe(true);
	});

	it('rejects negative rates and rates over 100%', () => {
		expect(
			createRoomSchema.safeParse({ ...room, serviceFeeRate: -0.01 }).success,
		).toBe(false);
		expect(
			createRoomSchema.safeParse({ ...room, cityTaxRate: 1.01 }).success,
		).toBe(false);
	});
});

describe('pricing rule schemas', () => {
	it('accepts a single-night rule (start = end)', () => {
		const result = createPricingRuleSchema.safeParse({
			...rule,
			startDate: '2030-06-08',
			endDate: '2030-06-08',
		});
		expect(result.success).toBe(true);
	});

	it('rejects end before start on create', () => {
		const result = createPricingRuleSchema.safeParse({
			...rule,
			startDate: '2030-06-10',
			endDate: '2030-06-08',
		});
		expect(result.success).toBe(false);
	});

	it('rejects end before start on update when both are given', () => {
		const result = updatePricingRuleSchema.safeParse({
			id: 'rule-1',
			startDate: '2030-06-10',
			endDate: '2030-06-08',
		});
		expect(result.success).toBe(false);
	});
});

const booking = {
	roomId: 'room-1',
	checkInDate: '2030-07-01',
	checkOutDate: '2030-07-03',
	guestCount: 1,
	guestName: 'Ada Guest',
	guestEmail: 'ada@example.test',
	guestPhone: '5555550100',
	basePrice: 200,
	totalAmount: 250,
};

describe('createBookingSchema', () => {
	it('accepts a valid booking', () => {
		expect(createBookingSchema.safeParse(booking).success).toBe(true);
	});

	it('rejects malformed dates', () => {
		expect(
			createBookingSchema.safeParse({ ...booking, checkInDate: '07/01/2030' })
				.success,
		).toBe(false);
	});

	it('requires check-out after check-in', () => {
		expect(
			createBookingSchema.safeParse({
				...booking,
				checkInDate: '2030-07-03',
				checkOutDate: '2030-07-03',
			}).success,
		).toBe(false);
	});
});

describe('booking inputs', () => {
	it('rejects impossible dates', () => {
		expect(
			createBookingSchema.safeParse({ ...booking, checkInDate: '2030-02-30' })
				.success,
		).toBe(false);
	});

	it('requires a Stripe Checkout Session id', () => {
		const publicId = 'seedroomrose0001';
		expect(
			confirmCheckoutSchema.safeParse({
				publicId,
				sessionId: 'cs_test_a1B2c3',
			}).success,
		).toBe(true);
		for (const sessionId of ['pi_123', 'cs_test_', 'cs_test_a b', 'x']) {
			expect(
				confirmCheckoutSchema.safeParse({ publicId, sessionId }).success,
			).toBe(false);
		}
	});
});

describe('publicIdSchema', () => {
	it.each(['seedroomrose0001', '0123456789abcdef'])('accepts %s', (value) => {
		expect(publicIdSchema.safeParse(value).success).toBe(true);
	});

	it.each([
		'',
		'short',
		'SEEDROOMROSE0001',
		'seedroomrose00012',
		'seedroomrose-001',
		'019a5f00-0000-7000-8000-000000000001',
	])('rejects %j', (value) => {
		expect(publicIdSchema.safeParse(value).success).toBe(false);
	});
});

describe('redirectSearchParam (sanitizer)', () => {
	it.each(['/account', '/booking/details?x=1', '/admin/bookings#top'])(
		'keeps same-origin path %s',
		(value) => {
			expect(redirectSearchParam.parse(value)).toBe(value);
		},
	);

	it.each([
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'\\\\evil.example',
		'javascript:alert(1)',
		'account',
		'/foo\nbar',
		'/foo\u0000',
	])('drops unsafe value %j', (value) => {
		expect(redirectSearchParam.parse(value)).toBeUndefined();
	});

	it('drops non-strings', () => {
		expect(redirectSearchParam.parse(42)).toBeUndefined();
	});
});
