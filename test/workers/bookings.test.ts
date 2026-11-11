import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';
import { dateInZone } from '@/utils/timezone';

import {
	bookingInput,
	caller,
	db,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	insertPricingRule,
	settle,
	trpcError,
	useClock,
} from './helpers';
import { mockEmail, mockStripeCheckout, mockStripeRefunds } from './mocks';
import { ADMIN, ROSE, TEXAS } from './seed';

const guest = () => caller('user');

/** Fields a guest response must never contain (admin-only or internal). */
const HIDDEN_BOOKING_FIELDS = [
	'id',
	'userId',
	'roomId',
	'internalNotes',
	'stripeCustomerId',
	'stripeSessionId',
	'stripePaymentIntentId',
	'stripeRefundId',
	'cancellationPolicyId',
];

function expectGuestShape(result: { booking: object }) {
	for (const field of HIDDEN_BOOKING_FIELDS) {
		expect(result.booking).not.toHaveProperty(field);
	}
}

async function bookingRow(id: string) {
	const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
	return row;
}

describe('date overlap with other bookings (stay Jun 10-12 exists)', () => {
	useClock('2033-05-20T17:00:00Z');

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

	it('allows same-day turnover after (check-in on its check-out)', async () => {
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

	it('allows same-day turnover before (check-out on its check-in)', async () => {
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

	it('allows check-in on an imported event’s end date (exclusive)', async () => {
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
	useClock('2033-12-20T17:00:00Z');

	it('a non-expired hold blocks a second guest', async () => {
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
	useClock('2034-02-20T17:00:00Z');

	it('calendar total equals checkout total', async () => {
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

	it('has no large-group surcharge', async () => {
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
		expect(row.totalAmount).toBe(253.12);
		// The tax snapshot: 6% + 7% on the room price plus the 12% fee.
		expect(row).toMatchObject({
			taxableAmount: 224,
			stateTaxRate: 0.06,
			cityTaxRate: 0.07,
			stateTaxAmount: 13.44,
			cityTaxAmount: 15.68,
		});
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

	it('getBooking: the owner gets guest fields only', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-06-05',
			checkOutDate: '2034-06-06',
			internalNotes: 'Admin-only note',
			stripeCustomerId: 'cus_test_secret',
			stripePaymentIntentId: 'pi_test_secret',
		});
		const own = await guest().bookings.getBooking({
			publicId: booking.publicId,
		});
		expect(own.booking.publicId).toBe(booking.publicId);
		expect(own.booking.confirmationId).toBe(booking.confirmationId);
		expect(own.booking.guestEmail).toBe(booking.guestEmail);
		expectGuestShape(own);
		expect(own).not.toHaveProperty('paymentDetails');
		expect(own).not.toHaveProperty('user');
		expect(Object.keys(own.room).sort()).toEqual(['name', 'slug']);
	});

	it('getMyBookings: guest fields only', async () => {
		await insertBooking({
			checkInDate: '2034-06-07',
			checkOutDate: '2034-06-08',
			internalNotes: 'Admin-only note',
			stripeCustomerId: 'cus_test_secret',
		});
		const rows = await guest().bookings.getMyBookings({ limit: 100 });
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expectGuestShape(row);
			expect(Object.keys(row.room).sort()).toEqual(['name', 'slug']);
		}
	});

	it('getBooking: an admin cannot read another guest’s booking through it', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-06-09',
			checkOutDate: '2034-06-10',
		});
		const error = await trpcError(
			caller('admin').bookings.getBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});

	it('adminGetBooking: the full row and the guest account', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-06-11',
			checkOutDate: '2034-06-12',
			internalNotes: 'Admin-only note',
		});
		const result = await caller('admin').bookings.adminGetBooking({
			publicId: booking.publicId,
		});
		expect(result.booking.id).toBe(booking.id);
		expect(result.booking.internalNotes).toBe('Admin-only note');
		expect(result.user).toMatchObject({ email: booking.guestEmail });
		expect(result.room).not.toHaveProperty('icalExportToken');
	});

	it('resendConfirmationEmail takes the publicId (owner)', async () => {
		mockEmail();
		const booking = await insertBooking({
			checkInDate: '2034-06-13',
			checkOutDate: '2034-06-14',
		});
		await expect(
			guest().bookings.resendConfirmationEmail({ publicId: booking.publicId }),
		).resolves.toMatchObject({ success: true });
		const error = await trpcError(
			caller('other').bookings.resendConfirmationEmail({
				publicId: booking.publicId,
			}),
		);
		expect(error.code).toBe('NOT_FOUND');
	});

	it('cancelBooking: another user’s booking is NOT_FOUND', async () => {
		const booking = await insertBooking({
			checkInDate: '2034-08-01',
			checkOutDate: '2034-08-02',
		});
		const error = await trpcError(
			caller('other').bookings.cancelBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});
});

describe('cancellation', () => {
	useClock('2034-08-20T17:00:00Z');

	const inDays = (n: number) =>
		dateInZone(new Date(Date.now() + n * 86_400_000));

	it('cancelling frees the dates', async () => {
		mockStripeRefunds();
		mockEmail();
		const booking = await insertBooking({
			checkInDate: '2034-09-10',
			checkOutDate: '2034-09-12',
			stripePaymentIntentId: 'pi_cancel_1',
		});
		await guest().bookings.cancelBooking({ publicId: booking.publicId });
		await settle();
		expect((await bookingRow(booking.id)).status).toBe('cancelled');
		await expect(
			caller('other').bookings.createBooking(
				bookingInput({ checkInDate: '2034-09-10', checkOutDate: '2034-09-12' }),
			),
		).resolves.toMatchObject({ success: true });
	});

	it('refunds in full more than 72 hours ahead, and emails guest and admins', async () => {
		const refunds = mockStripeRefunds();
		const sent = mockEmail();
		const booking = await insertBooking({
			checkInDate: inDays(10),
			checkOutDate: inDays(12),
			stripePaymentIntentId: 'pi_cancel_2',
		});
		const result = await guest().bookings.cancelBooking({
			publicId: booking.publicId,
		});
		await settle();
		expect(result).toMatchObject({ refundAmount: 250, refundPercent: 100 });
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get('payment_intent')).toBe('pi_cancel_2');
		expect(refunds[0].body.get('amount')).toBe('25000');
		expect(refunds[0].idempotencyKey).toBeTruthy();
		const row = await bookingRow(booking.id);
		expect(row).toMatchObject({
			status: 'cancelled',
			paymentStatus: 'refunded',
			refundAmount: 250,
			cancelledBy: 'guest',
		});
		expect(sent.some((e) => e.to.includes(booking.guestEmail))).toBe(true);
		expect(sent.some((e) => e.to.includes(ADMIN.email))).toBe(true);
	});

	it('refunds 50% between 24 and 72 hours ahead', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		const booking = await insertBooking({
			checkInDate: inDays(2),
			checkOutDate: inDays(4),
			stripePaymentIntentId: 'pi_cancel_3',
		});
		const quote = await guest().bookings.getCancellationQuote({
			publicId: booking.publicId,
		});
		expect(quote).toMatchObject({
			canCancel: true,
			refundPercent: 50,
			refundAmount: 125,
		});
		await guest().bookings.cancelBooking({ publicId: booking.publicId });
		await settle();
		expect(refunds[0].body.get('amount')).toBe('12500');
		expect((await bookingRow(booking.id)).paymentStatus).toBe(
			'partially_refunded',
		);
	});

	it('guests cannot cancel after check-in time; admins can, with a full refund', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		const booking = await insertBooking({
			checkInDate: inDays(-1),
			checkOutDate: inDays(1),
			stripePaymentIntentId: 'pi_cancel_4',
		});
		const error = await trpcError(
			guest().bookings.cancelBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('BAD_REQUEST');
		expect(refunds).toHaveLength(0);

		const result = await caller('admin').bookings.adminCancelBooking({
			publicId: booking.publicId,
			refund: 'full',
			reason: 'Storm damage',
		});
		await settle();
		expect(result.refundAmount).toBe(250);
		expect((await bookingRow(booking.id)).cancelledBy).toBe('admin');
	});

	it('cancelling an unpaid hold expires its Checkout Session and refunds nothing', async () => {
		const checkout = mockStripeCheckout();
		const session = checkout.add({ id: 'cs_test_hold1' });
		const booking = await insertBooking({
			checkInDate: '2034-11-10',
			checkOutDate: '2034-11-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 20 * 60_000),
			stripeSessionId: session.id,
		});
		const result = await guest().bookings.cancelBooking({
			publicId: booking.publicId,
		});
		expect(result.refundAmount).toBe(0);
		expect(checkout.expired).toEqual(['cs_test_hold1']);
		expect((await bookingRow(booking.id)).status).toBe('cancelled');
	});

	it('a hold whose payment is processing cannot be cancelled', async () => {
		mockStripeCheckout();
		const booking = await insertBooking({
			checkInDate: '2034-11-20',
			checkOutDate: '2034-11-22',
			status: 'pending',
			paymentStatus: 'processing',
			expiresAt: new Date(Date.now() - 60_000),
		});
		const error = await trpcError(
			guest().bookings.cancelBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('CONFLICT');
		expect((await bookingRow(booking.id)).status).toBe('pending');
	});

	it('refunds carry the booking ids in metadata (no personal data)', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		const booking = await insertBooking({
			checkInDate: inDays(20),
			checkOutDate: inDays(22),
			stripePaymentIntentId: 'pi_cancel_meta',
		});
		await guest().bookings.cancelBooking({ publicId: booking.publicId });
		await settle();
		const body = refunds[0].body;
		expect(body.get('metadata[bookingId]')).toBe(booking.id);
		expect(body.get('metadata[bookingPublicId]')).toBe(booking.publicId);
		expect(body.get('metadata[confirmationId]')).toBe(booking.confirmationId);
		expect(body.get('metadata[source]')).toBe('irishette');
		expect([...body.values()].join(' ')).not.toContain(booking.guestEmail);
	});

	it('keeps the policy a booking was made under', async () => {
		mockEmail();
		const before = await guest().bookings.createBooking(
			bookingInput({ checkInDate: inDays(30), checkOutDate: inDays(32) }),
		);
		await caller('admin').policies.saveCancellationPolicy({
			name: 'Strict',
			tiers: [{ minHoursBefore: 0, refundPercent: 0 }],
		});
		const after = await caller('other').bookings.createBooking(
			bookingInput({ checkInDate: inDays(40), checkOutDate: inDays(42) }),
		);
		const oldRow = await bookingRow(before.bookingId);
		const newRow = await bookingRow(after.bookingId);
		expect(oldRow.cancellationPolicyId).toBeNull();
		expect(newRow.cancellationPolicyId).toBeTruthy();
		await db()
			.update(bookings)
			.set({ status: 'confirmed', paymentStatus: 'paid' })
			.where(eq(bookings.id, after.bookingId));
		const quote = await caller('other').bookings.getCancellationQuote({
			publicId: after.publicId,
		});
		expect(quote.refundPercent).toBe(0);
		expect(quote.policy.name).toBe('Strict');
	});
});
