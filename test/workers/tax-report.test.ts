import { describe, expect, it } from 'vite-plus/test';

import { paymentRefunds, paymentTransactions } from '@/db/schema-export';
import { newId } from '@/utils/ids';

import { caller, db, insertBooking, trpcError } from './helpers';
import { TEXAS } from './seed';

// November 2030 in Central Time: Nov 1 00:00 CDT = 05:00 UTC; Dec 1 00:00
// CST = 06:00 UTC (daylight time ends on Nov 3, 2030).
const NOVEMBER = { from: '2030-11-01', to: '2030-11-30' };

/** A booking priced under the current rules (tax snapshot stored). */
const snapshot = {
	baseAmount: 200,
	feesAmount: 24,
	taxAmount: 29.12,
	totalAmount: 253.12,
	taxableAmount: 224,
	stateTaxRate: 0.06,
	cityTaxRate: 0.07,
	stateTaxAmount: 13.44,
	cityTaxAmount: 15.68,
};

async function insertPayment(bookingId: string, amount: number, at: string) {
	await db()
		.insert(paymentTransactions)
		.values({
			bookingId,
			stripePaymentIntentId: `pi_${newId()}`,
			amount,
			status: 'paid',
			createdAt: new Date(at),
			updatedAt: new Date(at),
		});
}

async function insertRefund(
	bookingId: string | null,
	amount: number,
	at: string,
	status = 'succeeded',
) {
	await db()
		.insert(paymentRefunds)
		.values({
			stripeRefundId: `re_${newId()}`,
			bookingId,
			source: 'app',
			amount,
			currency: 'usd',
			status,
			stripeCreatedAt: new Date(at),
		});
}

describe('reports.adminTaxReport', () => {
	it('reports payments and refunds of the Central Time period', async () => {
		const before = await insertBooking({ ...snapshot });
		const first = await insertBooking({ ...snapshot });
		const last = await insertBooking({ ...snapshot, roomId: TEXAS.id });
		const after = await insertBooking({ ...snapshot });
		// Booked before the snapshot columns: $26 tax on the room only.
		const legacy = await insertBooking();

		await insertPayment(before.id, 253.12, '2030-11-01T04:59:59Z');
		await insertPayment(first.id, 253.12, '2030-11-01T05:00:00Z');
		await insertPayment(legacy.id, 250, '2030-11-15T18:00:00Z');
		await insertPayment(last.id, 253.12, '2030-12-01T05:59:59Z');
		await insertPayment(after.id, 253.12, '2030-12-01T06:00:00Z');

		// Half of `first` back, in the period.
		await insertRefund(first.id, 126.56, '2030-11-20T18:00:00Z');
		// Not counted: still pending, failed, or made in December.
		await insertRefund(first.id, 10, '2030-11-21T18:00:00Z', 'pending');
		await insertRefund(first.id, 10, '2030-11-21T18:00:00Z', 'failed');
		await insertRefund(last.id, 253.12, '2030-12-01T06:00:00Z');
		// A dashboard refund that matches no booking.
		await insertRefund(null, 40, '2030-11-22T18:00:00Z');

		const report = await caller('admin').reports.adminTaxReport(NOVEMBER);

		expect(
			report.rows.map((r) => [r.type, r.date, r.confirmationId, r.total]),
		).toEqual([
			['payment', '2030-11-01', first.confirmationId, 25312],
			['payment', '2030-11-15', legacy.confirmationId, 25000],
			['refund', '2030-11-20', first.confirmationId, -12656],
			['refund', '2030-11-22', null, -4000],
			['payment', '2030-11-30', last.confirmationId, 25312],
		]);
		expect(report.rows[4]).toMatchObject({
			bookingPublicId: last.publicId,
			guestName: 'Fixture Guest',
			roomName: 'Texas Room',
			checkInDate: '2030-06-10',
			checkOutDate: '2030-06-12',
			estimated: false,
		});
		expect(report.rows[1]).toMatchObject({
			estimated: true,
			taxable: 20000,
			stateTax: 1200,
			cityTax: 1400,
		});
		expect(report.rows[3]).toMatchObject({ linked: false, stateTax: 0 });

		expect(report.summary.payments).toMatchObject({
			total: 75624,
			room: 60000,
			fees: 7200,
			receipts: 67200,
			untaxedFees: 2400,
			taxable: 64800,
			stateTax: 3888,
			cityTax: 4536,
			totalTax: 8424,
		});
		expect(report.summary.refunds).toMatchObject({
			total: -12656,
			taxable: -11200,
			totalTax: -1456,
		});
		expect(report.summary.net).toMatchObject({
			total: 62968,
			taxable: 53600,
			stateTax: 3216,
			cityTax: 3752,
			totalTax: 6968,
		});
		expect(report.unlinkedRefunds).toBe(-4000);
		expect(report.estimatedRows).toBe(1);
		expect(report.months.map((m) => m.month)).toEqual(['2030-11']);
		expect(report.months[0].net.total).toBe(62968);
	});

	it('returns an empty report for a period with no activity', async () => {
		const report = await caller('admin').reports.adminTaxReport({
			from: '2029-01-01',
			to: '2029-12-31',
		});
		expect(report.rows).toEqual([]);
		expect(report.months).toEqual([]);
		expect(report.summary.net.total).toBe(0);
	});

	it('never returns guest contact details or internal ids', async () => {
		const report = await caller('admin').reports.adminTaxReport(NOVEMBER);
		const text = JSON.stringify(report);
		expect(text).not.toContain('guest@example.test');
		expect(text).not.toContain('5555550100');
	});

	it('rejects invalid periods', async () => {
		const admin = caller('admin');
		for (const input of [
			{ from: '2030-11-30', to: '2030-11-01' },
			{ from: '2028-01-01', to: '2030-01-01' },
			{ from: '2030-02-30', to: '2030-03-01' },
		]) {
			const error = await trpcError(admin.reports.adminTaxReport(input));
			expect(error.code).toBe('BAD_REQUEST');
		}
	});

	it('is admin-only', async () => {
		const error = await trpcError(
			caller('user').reports.adminTaxReport(NOVEMBER),
		);
		expect(error.code).toBe('FORBIDDEN');
	});
});
