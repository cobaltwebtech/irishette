import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';

import { bookings, paymentRefunds } from '@/db/schema-export';
import { addDays } from '@/utils/date-range';

import {
	bookingInput,
	caller,
	db,
	inboxItemsOfKind,
	insertBooking,
	settle,
	trpcError,
	useClock,
} from './helpers';
import {
	mockResend,
	mockStripeRefunds,
	mockStripeRefundsFailing,
} from './mocks';
import { ADMIN } from './seed';

// Plan 02 Phase 3, part 2: stored check-in/out instants, the same-day cutoff,
// booking limits, cancellation windows with partial refunds and quote drift,
// and cancellations that save first and then refund.

const guest = () => caller('user');

async function row(id: string) {
	const [r] = await db().select().from(bookings).where(eq(bookings.id, id));
	return r;
}

describe('holds store the normalized check-in and check-out instants', () => {
	useClock('2032-12-01T17:00:00Z');

	it('4:00 PM CT check-in and 11:00 AM CT check-out, as UTC', async () => {
		const { bookingId } = await guest().bookings.createBooking(
			bookingInput({ checkInDate: '2033-01-10', checkOutDate: '2033-01-12' }),
		);
		const hold = await row(bookingId);
		expect(hold.checkInAt.toISOString()).toBe('2033-01-10T22:00:00.000Z');
		expect(hold.checkOutAt.toISOString()).toBe('2033-01-12T17:00:00.000Z');
	});

	it('rejects stays longer than 30 nights and check-outs beyond 10 months', async () => {
		const tooLong = await trpcError(
			guest().bookings.createBooking(
				bookingInput({ checkInDate: '2033-02-01', checkOutDate: '2033-03-04' }),
			),
		);
		expect(tooLong.code).toBe('BAD_REQUEST');
		expect(tooLong.message).toMatch(/30 nights/);
		const tooFar = await trpcError(
			caller(null).bookings.calculateBooking({
				roomId: bookingInput().roomId,
				checkInDate: '2033-09-30',
				checkOutDate: '2033-10-02',
				guestCount: 1,
			}),
		);
		expect(tooFar.code).toBe('BAD_REQUEST');
		expect(tooFar.message).toMatch(/10 months/);
	});
});

describe('same-day cutoff (9:00 AM CT)', () => {
	useClock('2032-12-01T17:00:00Z');

	const today = '2033-03-15';
	const book = () =>
		caller('other').bookings.createBooking(
			bookingInput({ checkInDate: today, checkOutDate: addDays(today, 1) }),
		);

	it('accepts check-in today at 8:59 AM CT', async () => {
		vi.setSystemTime(new Date('2033-03-15T13:59:00Z')); // 08:59 CDT
		await expect(book()).resolves.toMatchObject({ success: true });
	});

	it('refuses check-in today from 9:00 AM CT, for pricing too', async () => {
		vi.setSystemTime(new Date('2033-03-15T14:00:00Z')); // 09:00 CDT
		const error = await trpcError(book());
		expect(error.code).toBe('BAD_REQUEST');
		expect(error.message).toMatch(/Same-day bookings close at 9:00 AM CT/);
		const pricing = await trpcError(
			caller(null).bookings.calculateBooking({
				roomId: bookingInput().roomId,
				checkInDate: today,
				checkOutDate: addDays(today, 1),
				guestCount: 1,
			}),
		);
		expect(pricing.code).toBe('BAD_REQUEST');
	});

	it('availability.getBySlug reports today and the earliest check-in in CT', async () => {
		vi.setSystemTime(new Date('2033-03-15T14:00:00Z'));
		const data = await caller(null).availability.getBySlug({
			roomSlug: 'rose-room',
		});
		expect(data.today).toBe('2033-03-15');
		expect(data.earliestCheckIn).toBe('2033-03-16');
		expect(data.lastCheckOut).toBe('2034-01-15');
	});
});

describe('cancellation windows and refunds', () => {
	useClock('2033-06-01T17:00:00Z');

	let day = 0;
	/** A confirmed, paid booking checking in `daysAhead` days from the clock. */
	async function paid(daysAhead: number, overrides = {}) {
		day += 3;
		const checkIn = addDays('2033-06-01', daysAhead + day);
		return insertBooking({
			checkInDate: checkIn,
			checkOutDate: addDays(checkIn, 2),
			stripePaymentIntentId: `pi_integrity_${day}`,
			...overrides,
		});
	}

	it('records the applied tier and refunds with the amount in the idempotency key', async () => {
		const refunds = mockStripeRefunds();
		mockResend();
		const booking = await paid(20);
		const result = await guest().bookings.cancelBooking({
			publicId: booking.publicId,
			expectedRefundAmount: 250,
		});
		await settle();
		expect(result).toMatchObject({ refundAmount: 250, refundPercent: 100 });
		expect(refunds[0].idempotencyKey).toBe(`refund-cancel/${booking.id}/25000`);
		const after = await row(booking.id);
		expect(after).toMatchObject({
			status: 'cancelled',
			paymentStatus: 'refunded',
			refundAmount: 250,
			cancellationRefundPercent: 100,
		});
		// 100% tier: until 4:00 PM CT three days before check-in.
		expect(after.cancellationCutoffAt?.toISOString()).toBe(
			new Date(after.checkInAt.getTime() - 72 * 3_600_000).toISOString(),
		);
	});

	it('quote drift: a different expected amount is CONFLICT and nothing changes', async () => {
		const refunds = mockStripeRefunds();
		const booking = await paid(20);
		const error = await trpcError(
			guest().bookings.cancelBooking({
				publicId: booking.publicId,
				expectedRefundAmount: 125,
			}),
		);
		expect(error.code).toBe('CONFLICT');
		expect(error.message).toMatch(/\$250\.00/);
		expect(refunds).toHaveLength(0);
		expect((await row(booking.id)).status).toBe('confirmed');
	});

	it('after a partial refund in Stripe: the policy percent of the total, capped at what is left', async () => {
		const refunds = mockStripeRefunds();
		mockResend();
		const booking = await paid(20, {
			paymentStatus: 'partially_refunded',
			refundAmount: 200,
		});
		const quote = await guest().bookings.getCancellationQuote({
			publicId: booking.publicId,
		});
		expect(quote).toMatchObject({
			refundPercent: 100,
			refundAmount: 50,
			alreadyRefunded: 200,
			refundableAmount: 50,
		});
		await guest().bookings.cancelBooking({
			publicId: booking.publicId,
			expectedRefundAmount: 50,
		});
		await settle();
		expect(refunds[0].body.get('amount')).toBe('5000');
		expect(await row(booking.id)).toMatchObject({
			paymentStatus: 'refunded',
			refundAmount: 250,
		});
	});

	it('a booking already refunded in full makes no Stripe call', async () => {
		const refunds = mockStripeRefunds();
		mockResend();
		const booking = await paid(20, {
			paymentStatus: 'refunded',
			refundAmount: 250,
		});
		const result = await caller('admin').bookings.adminCancelBooking({
			publicId: booking.publicId,
			refund: 'full',
		});
		await settle();
		expect(result.refundAmount).toBe(0);
		expect(refunds).toHaveLength(0);
		expect((await row(booking.id)).status).toBe('cancelled');
	});

	it('saves the cancellation first: a failed refund leaves it cancelled, refund_failed, admins alerted', async () => {
		const attempts = mockStripeRefundsFailing();
		const sent = mockResend();
		const booking = await paid(20);
		const result = await guest().bookings.cancelBooking({
			publicId: booking.publicId,
		});
		await settle();
		expect(attempts).toHaveLength(1);
		expect(result).toMatchObject({ refundAmount: 250, refundFailed: true });
		expect(await row(booking.id)).toMatchObject({
			status: 'cancelled',
			paymentStatus: 'refund_failed',
		});
		const refundRows = await db()
			.select()
			.from(paymentRefunds)
			.where(eq(paymentRefunds.bookingId, booking.id));
		expect(refundRows).toHaveLength(0);
		const [item] = (await inboxItemsOfKind('refund_failed')).filter(
			(i) => i.bookingId === booking.id,
		);
		expect(item?.dedupeKey).toBe(`refund_failed:cancel:${booking.id}`);
		expect(
			sent.some(
				(e) =>
					e.to.includes(ADMIN.email) && e.subject.startsWith('Refund failed'),
			),
		).toBe(true);
	});

	it('guest bookings carry the stay phase and whether they can still be cancelled', async () => {
		const upcoming = await paid(20);
		const past = await insertBooking({
			checkInDate: '2033-05-01',
			checkOutDate: '2033-05-03',
		});
		const list = await guest().bookings.getMyBookings({ limit: 100 });
		const byId = new Map(list.map((r) => [r.booking.publicId, r.booking]));
		expect(byId.get(upcoming.publicId)).toMatchObject({
			stayPhase: 'upcoming',
			canCancel: true,
		});
		expect(byId.get(past.publicId)).toMatchObject({
			stayPhase: 'past',
			canCancel: false,
		});
		const pastOnly = await guest().bookings.getMyBookings({
			limit: 100,
			phase: 'past',
		});
		expect(pastOnly.some((r) => r.booking.publicId === upcoming.publicId)).toBe(
			false,
		);
		expect(pastOnly.some((r) => r.booking.publicId === past.publicId)).toBe(
			true,
		);
	});
});
