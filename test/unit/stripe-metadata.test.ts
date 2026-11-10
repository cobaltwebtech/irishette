import { describe, expect, it } from 'vite-plus/test';

import { checkoutLineItems } from '@/lib/booking/checkout-service';
import { stripeBookingMetadata, toCents } from '@/lib/stripe/stripe';

describe('stripeBookingMetadata', () => {
	const booking = {
		id: '019a5f00-0000-7000-8000-00000000b001',
		publicId: 'abcdefghij012345',
		confirmationId: 'ABC123',
		guestName: 'Ada Guest',
		guestEmail: 'ada@example.test',
		guestPhone: '5555550100',
	};

	it('links Stripe objects to the booking with our ids only', () => {
		expect(stripeBookingMetadata(booking)).toEqual({
			bookingId: booking.id,
			bookingPublicId: booking.publicId,
			confirmationId: booking.confirmationId,
			source: 'irishette',
		});
	});

	it('never includes personal data', () => {
		const values = Object.values(stripeBookingMetadata(booking)).join(' ');
		expect(values).not.toContain(booking.guestName);
		expect(values).not.toContain(booking.guestEmail);
		expect(values).not.toContain(booking.guestPhone);
	});
});

describe('checkoutLineItems', () => {
	const room = { name: 'Rose Room', stateTaxRate: 0.06, cityTaxRate: 0.07 };
	const total = (items: ReturnType<typeof checkoutLineItems>) =>
		items.reduce(
			(sum, i) => sum + (i.price_data?.unit_amount ?? 0) * (i.quantity ?? 1),
			0,
		);

	it('adds up to the booking total: room, fee, state and city tax', () => {
		const booking = {
			baseAmount: 200,
			feesAmount: 24,
			taxAmount: 26,
			numberOfNights: 2,
		};
		const items = checkoutLineItems(booking, room);
		expect(items.map((i) => i.price_data?.product_data?.name)).toEqual([
			'Rose Room, 2 nights',
			'Service fee',
			'State hotel occupancy tax',
			'City hotel occupancy tax',
		]);
		expect(items.map((i) => i.price_data?.unit_amount)).toEqual([
			20000, 2400, 1200, 1400,
		]);
		expect(total(items)).toBe(toCents(250));
	});

	it('uses the tax split stored on the booking', () => {
		const items = checkoutLineItems(
			{
				baseAmount: 200,
				feesAmount: 24,
				taxAmount: 29.12,
				stateTaxAmount: 13.44,
				cityTaxAmount: 15.68,
				numberOfNights: 2,
			},
			room,
		);
		expect(items.map((i) => i.price_data?.unit_amount)).toEqual([
			20000, 2400, 1344, 1568,
		]);
		expect(total(items)).toBe(toCents(253.12));
	});

	it('leaves out zero lines (a room with no fee or tax)', () => {
		const items = checkoutLineItems(
			{ baseAmount: 99.99, feesAmount: 0, taxAmount: 0, numberOfNights: 1 },
			{ name: 'Rose Room', stateTaxRate: 0, cityTaxRate: 0 },
		);
		expect(items).toHaveLength(1);
		expect(items[0].price_data?.product_data?.name).toBe('Rose Room, 1 night');
		expect(total(items)).toBe(9999);
	});

	it('keeps the total exact when rounding splits the tax unevenly', () => {
		const booking = {
			baseAmount: 123.45,
			feesAmount: 14.81,
			taxAmount: 16.05,
			numberOfNights: 1,
		};
		expect(total(checkoutLineItems(booking, room))).toBe(
			toCents(123.45 + 14.81 + 16.05),
		);
	});
});
