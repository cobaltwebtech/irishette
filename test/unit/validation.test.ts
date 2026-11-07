import { describe, expect, it } from 'vitest';
import { publicIdSchema } from '@/lib/ids';
import {
	createBookingSchema,
	updateBookingSchema,
} from '@/lib/payment-validation';
import { redirectSearchParam } from '@/lib/redirect';
import {
	createPricingRuleSchema,
	updatePricingRuleSchema,
} from '@/lib/room-validation';

const rule = {
	roomId: 'room-1',
	name: 'Holiday',
	ruleType: 'absolute_price' as const,
	value: 150,
	startDate: '2030-06-08',
	endDate: '2030-06-10',
	isActive: true,
};

describe('pricing rule schemas', () => {
	it('accepts a single-night rule (start = end)', () => {
		const result = createPricingRuleSchema.safeParse({
			...rule,
			startDate: '2030-06-08',
			endDate: '2030-06-08',
		});
		expect(result.success).toBe(true);
	});

	// Phase 7.3: create/update must reject end < start.
	it.fails('rejects end before start on create', () => {
		const result = createPricingRuleSchema.safeParse({
			...rule,
			startDate: '2030-06-10',
			endDate: '2030-06-08',
		});
		expect(result.success).toBe(false);
	});

	it.fails('rejects end before start on update when both are given', () => {
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

	// Phase 7.2: check-out must be after check-in.
	it.fails('requires check-out after check-in', () => {
		expect(
			createBookingSchema.safeParse({
				...booking,
				checkInDate: '2030-07-03',
				checkOutDate: '2030-07-03',
			}).success,
		).toBe(false);
	});
});

describe('updateBookingSchema', () => {
	// Phase 7.2 (critical): users must not be able to set `status`.
	it.fails('does not accept a status', () => {
		const parsed = updateBookingSchema.parse({
			bookingId: 'b1',
			status: 'confirmed',
		});
		expect(parsed).not.toHaveProperty('status');
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
