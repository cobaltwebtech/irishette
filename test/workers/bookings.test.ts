import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { bookings } from '@/db/schema-export';
import {
	bookingInput,
	caller,
	db,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	insertPricingRule,
	trpcError,
} from './helpers';
import { mockStripeRefunds } from './mocks';
import { ROSE, TEXAS } from './seed';

const guest = () => caller('user');

async function bookingRow(id: string) {
	const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
	return row;
}

describe('date overlap with other bookings (stay Jun 10-12 exists)', () => {
	it('rejects a partial overlap', async () => {
		await insertBooking({
			checkInDate: '2033-06-10',
			checkOutDate: '2033-06-12',
		});
		await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-06-11', checkOutDate: '2033-06-14' }),
			),
		);
	});

	it('rejects a stay that contains the existing one', async () => {
		await insertBooking({
			checkInDate: '2033-07-10',
			checkOutDate: '2033-07-12',
		});
		await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-07-09', checkOutDate: '2033-07-13' }),
			),
		);
	});

	it.fails('allows same-day turnover after (check-in on its check-out)', async () => {
		await insertBooking({
			checkInDate: '2033-08-10',
			checkOutDate: '2033-08-12',
		});
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-08-12', checkOutDate: '2033-08-14' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it.fails('allows same-day turnover before (check-out on its check-in)', async () => {
		await insertBooking({
			checkInDate: '2033-09-10',
			checkOutDate: '2033-09-12',
		});
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-09-08', checkOutDate: '2033-09-10' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it.fails('allows check-in on an imported event’s end date (exclusive)', async () => {
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: '2033-10-10',
			endDate: '2033-10-12',
		});
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-10-12', checkOutDate: '2033-10-13' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it('rejects a stay over an imported event', async () => {
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: '2033-11-10',
			endDate: '2033-11-12',
		});
		await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-11-11', checkOutDate: '2033-11-13' }),
			),
		);
	});

	it('ignores bookings in other rooms', async () => {
		await insertBooking({
			roomId: TEXAS.id,
			checkInDate: '2033-12-10',
			checkOutDate: '2033-12-12',
		});
		await expect(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-12-10', checkOutDate: '2033-12-12' }),
			),
		).resolves.toMatchObject({ success: true });
	});
});

describe('pending holds', () => {
	it.fails('a non-expired hold blocks a second guest', async () => {
		await insertBooking({
			checkInDate: '2034-01-10',
			checkOutDate: '2034-01-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		});
		const error = await trpcError(
			caller('other').bookings.createBooking(
				bookingInput({ checkInDate: '2034-01-10', checkOutDate: '2034-01-12' }),
			),
		);
		expect(error.code).toBe('CONFLICT');
	});

	it('an expired hold does not block', async () => {
		await insertBooking({
			checkInDate: '2034-02-10',
			checkOutDate: '2034-02-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60 * 1000),
		});
		await expect(
			caller('other').bookings.createBooking(
				bookingInput({ checkInDate: '2034-02-10', checkOutDate: '2034-02-12' }),
			),
		).resolves.toMatchObject({ success: true });
	});
});

describe('booking pricing', () => {
	it.fails('calendar total equals checkout total', async () => {
		// Rule covers only part of the stay.
		await insertPricingRule({
			startDate: '2034-03-08',
			endDate: '2034-03-10',
			ruleType: 'surcharge_rate',
			value: 0.2,
		});
		const input = {
			roomId: ROSE.id,
			checkInDate: '2034-03-09',
			checkOutDate: '2034-03-13',
			guestCount: 1,
		};
		const calendar = await caller(null).rooms.calculatePricing(input);
		const checkout = await caller(null).bookings.calculateBooking(input);
		expect(checkout.baseAmount).toBe(calendar.baseAmount);
	});

	it.fails('has no large-group surcharge', async () => {
		await caller('admin').rooms.update({ id: ROSE.id, maxGuests: 6 });
		const input = {
			roomId: ROSE.id,
			checkInDate: '2034-04-01',
			checkOutDate: '2034-04-03',
		};
		const two = await caller(null).bookings.calculateBooking({
			...input,
			guestCount: 2,
		});
		const five = await caller(null).bookings.calculateBooking({
			...input,
			guestCount: 5,
		});
		expect(five.totalAmount).toBe(two.totalAmount);
	});

	it('stores the server-computed price, not the client one', async () => {
		const { bookingId } = await guest().bookings.createBooking(
			bookingInput({
				checkInDate: '2034-05-01',
				checkOutDate: '2034-05-03',
				basePrice: 1,
				totalAmount: 1,
			}),
		);
		const row = await bookingRow(bookingId);
		expect(row.baseAmount).toBe(200);
		expect(row.totalAmount).toBe(250);
	});
});

describe('access and ownership', () => {
	it('getBooking: another user’s booking is NOT_FOUND', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-06-01',
			checkOutDate: '2034-06-02',
		});
		const error = await trpcError(
			caller('other').bookings.getBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});

	it('getBooking: the owner gets user: null, an admin gets the guest', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-06-05',
			checkOutDate: '2034-06-06',
		});
		const own = await guest().bookings.getBooking({
			publicId: booking.publicId,
		});
		expect(own.booking.publicId).toBe(booking.publicId);
		expect(own.user).toBeNull();
		expect(own.room).not.toHaveProperty('icalExportToken');

		const asAdmin = await caller('admin').bookings.getBooking({
			publicId: booking.publicId,
		});
		expect(asAdmin.user).toMatchObject({ email: booking.guestEmail });
	});

	it.fails('updateBooking: a user cannot confirm their own booking', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-07-01',
			checkOutDate: '2034-07-02',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		});
		// Either the input is rejected or the status is ignored.
		await guest()
			.bookings.updateBooking({
				bookingId: booking.id,
				status: 'confirmed',
			} as never)
			.catch(() => undefined);
		expect((await bookingRow(booking.id)).status).toBe('pending');
	});

	it('cancelBooking: another user’s booking is NOT_FOUND', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-08-01',
			checkOutDate: '2034-08-02',
		});
		const error = await trpcError(
			caller('other').bookings.cancelBooking({ bookingId: booking.id }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});
});

describe('cancellation', () => {
	it('cancelling frees the dates', async () => {
		mockStripeRefunds();
		const booking = await insertBooking({
			checkInDate: '2034-09-10',
			checkOutDate: '2034-09-12',
			stripePaymentIntentId: 'pi_cancel_1',
		});
		await guest().bookings.cancelBooking({ bookingId: booking.id });
		expect((await bookingRow(booking.id)).status).toBe('cancelled');
		await expect(
			caller('other').bookings.createBooking(
				bookingInput({ checkInDate: '2034-09-10', checkOutDate: '2034-09-12' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it.fails('cancelling a paid booking refunds it in Stripe', async () => {
		const refunds = mockStripeRefunds();
		const booking = await insertBooking({
			checkInDate: '2034-10-10',
			checkOutDate: '2034-10-12',
			stripePaymentIntentId: 'pi_cancel_2',
		});
		await guest().bookings.cancelBooking({ bookingId: booking.id });
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get('payment_intent')).toBe('pi_cancel_2');
		expect(refunds[0].idempotencyKey).toBeTruthy();
		expect((await bookingRow(booking.id)).paymentStatus).toBe('refunded');
	});
});
