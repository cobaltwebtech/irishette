import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import {
	bookings,
	paymentRefunds,
	paymentTransactions,
} from '@/db/schema-export';
import { addDays } from '@/utils/date-range';

import { caller, db, settle, trpcError, useClock } from './helpers';
import { mockEmail } from './mocks';
import { GUEST, ROSE } from './seed';

// Admin bookings paid outside Stripe (Cash/Check/Other): confirmed at once
// with the payment and its taxes recorded, the confirmation emailed, no
// Stripe call (an unmocked request would fail the test). Guests can't
// cancel them online; refunds are recorded as owed and the tax report nets
// them; a change's extra charge can be collected outside Stripe too.

const admin = () => caller('admin');
const guest = () => caller('user');

let day = 0;
/** An offline booking for the seeded guest (an existing account). */
async function offlineBooking() {
	day += 5;
	const checkInDate = addDays('2033-04-01', day);
	const hold = await admin().bookings.adminCreateBooking({
		roomId: ROSE.id,
		checkInDate,
		checkOutDate: addDays(checkInDate, 2),
		guestCount: 1,
		guestName: 'Cash Guest',
		guestEmail: GUEST.email,
		guestPhone: '5555550188',
		estimatedArrival: '17:00',
		paymentMethod: 'offline',
	});
	const confirmed = await admin().bookings.adminConfirmOfflinePayment({
		bookingId: hold.bookingId,
	});
	expect(confirmed.publicId).toBe(hold.publicId);
	return hold;
}

async function bookingRow(id: string) {
	const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
	return row;
}

const payments = (bookingId: string) =>
	db()
		.select()
		.from(paymentTransactions)
		.where(eq(paymentTransactions.bookingId, bookingId));

const refunds = (bookingId: string) =>
	db()
		.select()
		.from(paymentRefunds)
		.where(eq(paymentRefunds.bookingId, bookingId));

describe('admin booking paid outside Stripe', () => {
	useClock('2033-03-15T15:00:00Z');

	it('confirms, records the payment with its taxes and emails the guest', async () => {
		const sent = mockEmail();
		const hold = await offlineBooking();
		const row = await bookingRow(hold.bookingId);
		expect(row).toMatchObject({
			status: 'confirmed',
			paymentStatus: 'paid',
			stripeSessionId: null,
			stripePaymentIntentId: null,
			// No card kept on file: no consent recorded.
			cardConsentAt: null,
			cardConsentBy: null,
		});
		const [payment] = await payments(hold.bookingId);
		expect(payment).toMatchObject({
			paymentMethod: 'offline',
			status: 'paid',
			amount: row.totalAmount,
			stripePaymentIntentId: null,
			roomAmount: row.baseAmount,
			stateTaxAmount: row.stateTaxAmount,
			cityTaxAmount: row.cityTaxAmount,
		});
		await settle();
		const mine = sent.filter((e) => e.subject.includes(row.confirmationId));
		expect(mine.map((e) => e.subject)).toEqual(
			expect.arrayContaining([expect.stringContaining('Booking Confirmed')]),
		);
		expect(mine.some((e) => e.to.includes(GUEST.email))).toBe(true);
	});

	it('still requires the card consent for a card booking', async () => {
		const error = await trpcError(
			admin().bookings.adminCreateBooking({
				roomId: ROSE.id,
				checkInDate: '2033-05-20',
				checkOutDate: '2033-05-22',
				guestCount: 1,
				guestName: 'Card Guest',
				guestEmail: GUEST.email,
				guestPhone: '5555550188',
				estimatedArrival: '17:00',
				paymentMethod: 'card',
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
		expect(error.message).toMatch(/card on file/);
	});

	it('refuses to record the offline payment twice', async () => {
		mockEmail();
		const hold = await offlineBooking();
		const again = await trpcError(
			admin().bookings.adminConfirmOfflinePayment({
				bookingId: hold.bookingId,
			}),
		);
		expect(again.code).toBe('BAD_REQUEST');
		expect(await payments(hold.bookingId)).toHaveLength(1);
		await settle();
	});

	it('guests cannot cancel it online', async () => {
		mockEmail();
		const hold = await offlineBooking();
		const mine = await guest().bookings.getBooking({ publicId: hold.publicId });
		expect(mine.booking.canCancel).toBe(false);
		const quote = await guest().bookings.getCancellationQuote({
			publicId: hold.publicId,
		});
		expect(quote).toMatchObject({
			canCancel: false,
			cancelBlocked: 'contact_us',
		});
		const error = await trpcError(
			guest().bookings.cancelBooking({ publicId: hold.publicId }),
		);
		expect(error.code).toBe('CONFLICT');
		expect((await bookingRow(hold.bookingId)).status).toBe('confirmed');
		// Admins still can.
		const asAdmin = await admin().bookings.getCancellationQuote({
			publicId: hold.publicId,
		});
		expect(asAdmin.canCancel).toBe(true);
		await settle();
	});

	it('an admin cancellation records the refund as owed and the tax report nets it', async () => {
		const sent = mockEmail();
		const hold = await offlineBooking();
		const before = await bookingRow(hold.bookingId);
		const result = await admin().bookings.adminCancelBooking({
			publicId: hold.publicId,
			refund: 'full',
		});
		expect(result).toMatchObject({
			refundAmount: before.totalAmount,
			refundFailed: false,
		});
		const after = await bookingRow(hold.bookingId);
		expect(after).toMatchObject({
			status: 'cancelled',
			paymentStatus: 'refunded',
			refundAmount: before.totalAmount,
		});
		expect(after.stripeRefundId).toMatch(/^offline_/);
		const [refund] = await refunds(hold.bookingId);
		expect(refund).toMatchObject({
			source: 'offline',
			status: 'succeeded',
			amount: before.totalAmount,
			stateTaxAmount: before.stateTaxAmount,
			cityTaxAmount: before.cityTaxAmount,
		});
		const [payment] = await payments(hold.bookingId);
		expect(payment).toMatchObject({
			status: 'refunded',
			amountRefunded: before.totalAmount,
		});

		const report = await admin().reports.adminTaxReport({
			from: '2033-03-01',
			to: '2033-03-31',
		});
		const lines = report.rows.filter(
			(r) => r.confirmationId === before.confirmationId,
		);
		expect(lines.map((r) => [r.type, r.total])).toEqual([
			['payment', Math.round(before.totalAmount * 100)],
			['refund', -Math.round(before.totalAmount * 100)],
		]);
		expect(lines.reduce((sum, r) => sum + r.stateTax + r.cityTax, 0)).toBe(0);

		await settle();
		const notice = sent.find(
			(e) =>
				e.to.includes(GUEST.email) && e.subject.includes('Booking Cancelled'),
		);
		expect(notice?.text).toMatch(/our team will return your refund/);
		const adminNotice = sent.find(
			(e) =>
				!e.to.includes(GUEST.email) && e.subject.includes('Booking Cancelled'),
		);
		expect(adminNotice?.text).toMatch(/pay it back to the guest by hand/);
	});
});

describe('changes to a booking paid outside Stripe', () => {
	useClock('2033-03-15T15:00:00Z');

	async function change(
		publicId: string,
		target: { checkInDate: string; checkOutDate: string },
		collectOffline?: boolean,
	) {
		const input = { publicId, roomId: ROSE.id, ...target };
		const quote = await admin().bookings.adminQuoteModification(input);
		const result = await admin().bookings.adminModifyBooking({
			...input,
			expectedDifferenceCents: quote.differenceCents,
			collectOffline,
		});
		return { quote, result };
	}

	it('records an extra charge collected outside Stripe, then an owed refund', async () => {
		mockEmail();
		const hold = await offlineBooking();
		const row = await bookingRow(hold.bookingId);

		const longer = await change(
			hold.publicId,
			{
				checkInDate: row.checkInDate,
				checkOutDate: addDays(row.checkOutDate, 1),
			},
			true,
		);
		expect(longer.quote.paidOffline).toBe(true);
		expect(longer.quote.differenceCents).toBeGreaterThan(0);
		expect(longer.result).toMatchObject({ status: 'applied' });
		const extra = (await payments(hold.bookingId)).find(
			(p) => p.amount === longer.quote.differenceCents / 100,
		);
		expect(extra).toMatchObject({
			paymentMethod: 'offline',
			status: 'paid',
			stripePaymentIntentId: null,
		});
		expect(extra?.stateTaxAmount).toBeGreaterThan(0);

		const shorter = await change(hold.publicId, {
			checkInDate: row.checkInDate,
			checkOutDate: row.checkOutDate,
		});
		expect(shorter.quote.differenceCents).toBeLessThan(0);
		expect(shorter.result).toMatchObject({
			status: 'applied',
			refundFailed: false,
		});
		const owed = await refunds(hold.bookingId);
		expect(owed).toHaveLength(1);
		expect(owed[0]).toMatchObject({
			source: 'offline',
			status: 'succeeded',
			amount: -shorter.quote.differenceCents / 100,
		});
		await settle();
	});
});
