import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';

import {
	bookingInput,
	caller,
	causeField,
	db,
	insertBlock,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	settle,
	trpcError,
	useClock,
} from './helpers';
import { mockEmail, mockStripeCheckout } from './mocks';
import { ROSE } from './seed';

// Admin blocks: inclusive start/end. A block conflicts with a booking if
// blk.start < b.checkOut AND blk.end >= b.checkIn.

const admin = () => caller('admin');

const blockInput = (startDate: string, endDate: string) => ({
	roomId: ROSE.id,
	startDate,
	endDate,
	reason: 'Maintenance',
});

describe('creating a block over existing stays', () => {
	it('allows a block that ends the day before a check-in', async () => {
		await insertBooking({
			checkInDate: '2030-03-10',
			checkOutDate: '2030-03-12',
		});
		await expect(
			admin().rooms.createBlockedPeriod(blockInput('2030-03-07', '2030-03-09')),
		).resolves.toBeTruthy();
	});

	it('allows a block that starts on a check-out day', async () => {
		await insertBooking({
			checkInDate: '2030-04-10',
			checkOutDate: '2030-04-12',
		});
		await expect(
			admin().rooms.createBlockedPeriod(blockInput('2030-04-12', '2030-04-13')),
		).resolves.toBeTruthy();
	});

	it('rejects a block over a confirmed booking', async () => {
		const booking = await insertBooking({
			checkInDate: '2030-05-10',
			checkOutDate: '2030-05-12',
		});
		const error = await trpcError(
			admin().rooms.createBlockedPeriod(blockInput('2030-05-11', '2030-05-11')),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflicts')).toEqual([
			expect.objectContaining({
				publicId: booking.publicId,
				source: 'direct',
				checkIn: '2030-05-10',
				checkOut: '2030-05-12',
				status: 'confirmed',
			}),
		]);
	});

	it('rejects a block over a non-expired pending booking', async () => {
		await insertBooking({
			checkInDate: '2030-06-20',
			checkOutDate: '2030-06-22',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		});
		const error = await trpcError(
			admin().rooms.createBlockedPeriod(blockInput('2030-06-21', '2030-06-25')),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflicts')).toEqual([
			expect.objectContaining({ status: 'pending' }),
		]);
	});

	it('allows a block over an expired pending booking', async () => {
		await insertBooking({
			checkInDate: '2030-07-20',
			checkOutDate: '2030-07-22',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60 * 1000),
		});
		await expect(
			admin().rooms.createBlockedPeriod(blockInput('2030-07-20', '2030-07-21')),
		).resolves.toBeTruthy();
	});

	it('confirms an expired hold that was paid after all, then rejects the block', async () => {
		const checkout = mockStripeCheckout();
		mockEmail();
		const hold = await insertBooking({
			checkInDate: '2030-08-20',
			checkOutDate: '2030-08-22',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60 * 1000),
		});
		// The guest paid, but no confirmation ran (webhook down, tab closed).
		const session = checkout.add({
			id: `cs_test_blk${hold.publicId}`,
			amount_total: Math.round(hold.totalAmount * 100),
			client_reference_id: hold.id,
			metadata: { bookingId: hold.id, source: 'irishette' },
		});
		checkout.complete(session.id);
		await db()
			.update(bookings)
			.set({ stripeSessionId: session.id })
			.where(eq(bookings.id, hold.id));

		const error = await trpcError(
			admin().rooms.createBlockedPeriod(blockInput('2030-08-21', '2030-08-21')),
		);
		expect(error.code).toBe('CONFLICT');
		expect(checkout.captures).toHaveLength(1);
		const [row] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, hold.id));
		expect(row).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
		await settle();
	});

	it('rejects a block over an imported external event', async () => {
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: '2030-08-10',
			endDate: '2030-08-12',
		});
		const error = await trpcError(
			admin().rooms.createBlockedPeriod(blockInput('2030-08-11', '2030-08-11')),
		);
		expect(error.code).toBe('CONFLICT');
		expect(causeField(error, 'conflicts')).toEqual([
			expect.objectContaining({ source: 'airbnb', checkIn: '2030-08-10' }),
		]);
	});

	it('rejects moving a block over a booking (update)', async () => {
		await insertBooking({
			checkInDate: '2030-09-10',
			checkOutDate: '2030-09-12',
		});
		const block = await insertBlock({
			startDate: '2030-09-01',
			endDate: '2030-09-02',
		});
		const error = await trpcError(
			admin().rooms.updateBlockedPeriod({
				id: block.id,
				endDate: '2030-09-10',
			}),
		);
		expect(error.code).toBe('CONFLICT');
	});
});

describe('booking around a block (block Jun 8-10)', () => {
	useClock('2031-05-20T17:00:00Z');

	const guest = () => caller('user');

	it('rejects check-in on the block’s last day', async () => {
		await insertBlock({ startDate: '2031-06-08', endDate: '2031-06-10' });
		const error = await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2031-06-10', checkOutDate: '2031-06-11' }),
			),
		);
		expect(error.code).toBe('CONFLICT');
	});

	it('allows check-in the day after the block', async () => {
		await insertBlock({ startDate: '2031-07-08', endDate: '2031-07-10' });
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2031-07-11', checkOutDate: '2031-07-12' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it('allows check-out on the block’s first day (stay Jun 7-8)', async () => {
		await insertBlock({ startDate: '2031-08-08', endDate: '2031-08-10' });
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2031-08-07', checkOutDate: '2031-08-08' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it('rejects a stay that runs into the block (Jun 7-9)', async () => {
		await insertBlock({ startDate: '2031-09-08', endDate: '2031-09-10' });
		const error = await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2031-09-07', checkOutDate: '2031-09-09' }),
			),
		);
		expect(error.code).toBe('CONFLICT');
	});

	it('rejects a one-night stay inside the block', async () => {
		await insertBlock({ startDate: '2031-10-08', endDate: '2031-10-10' });
		const error = await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2031-10-09', checkOutDate: '2031-10-10' }),
			),
		);
		expect(error.code).toBe('CONFLICT');
	});
});
