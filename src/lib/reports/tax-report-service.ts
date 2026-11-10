import { and, eq, gte, lt } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	paymentRefunds,
	paymentTransactions,
	room,
} from '@/db/schema-export';
import { addDays } from '@/utils/date-range';
import { zonedTimeToUtc } from '@/utils/timezone';

import type { TaxReportInput } from './report-validation';
import {
	aggregateTaxReport,
	type TaxReport,
	type TaxReportBooking,
} from './tax-report';

// Hotel Occupancy Tax report data (docs/TAX_REPORTING.md). Server-only.
// Cash basis: a payment counts on the day it was taken and a refund on the
// day Stripe made it, both in Central Time. Disputes are not adjusted.

/** Booking columns the report needs (explicit: no notes, email or phone). */
const bookingColumns = {
	publicId: bookings.publicId,
	confirmationId: bookings.confirmationId,
	guestName: bookings.guestName,
	roomName: room.name,
	checkInDate: bookings.checkInDate,
	checkOutDate: bookings.checkOutDate,
	baseAmount: bookings.baseAmount,
	feesAmount: bookings.feesAmount,
	taxAmount: bookings.taxAmount,
	stateTaxAmount: bookings.stateTaxAmount,
	cityTaxAmount: bookings.cityTaxAmount,
	roomStateTaxRate: room.stateTaxRate,
	roomCityTaxRate: room.cityTaxRate,
};

/** A left join gives all-null booking columns when there is no booking. */
function linkedBooking(
	row: Record<keyof typeof bookingColumns, string | number | null>,
): TaxReportBooking | null {
	return row.publicId === null ? null : (row as TaxReportBooking);
}

/**
 * Payments and succeeded refunds from `from` 00:00 CT up to (not including)
 * the day after `to` 00:00 CT, with the summary and monthly totals.
 */
export async function getTaxReport(
	{ db }: { db: Database },
	{ from, to }: TaxReportInput,
): Promise<TaxReport> {
	const start = zonedTimeToUtc(from, '00:00');
	const end = zonedTimeToUtc(addDays(to, 1), '00:00');

	const [payments, refunds] = await Promise.all([
		db
			.select({
				id: paymentTransactions.id,
				at: paymentTransactions.createdAt,
				amount: paymentTransactions.amount,
				...bookingColumns,
			})
			.from(paymentTransactions)
			.innerJoin(bookings, eq(paymentTransactions.bookingId, bookings.id))
			.innerJoin(room, eq(bookings.roomId, room.id))
			.where(
				and(
					gte(paymentTransactions.createdAt, start),
					lt(paymentTransactions.createdAt, end),
				),
			),
		db
			.select({
				id: paymentRefunds.id,
				at: paymentRefunds.stripeCreatedAt,
				amount: paymentRefunds.amount,
				...bookingColumns,
			})
			.from(paymentRefunds)
			.leftJoin(bookings, eq(paymentRefunds.bookingId, bookings.id))
			.leftJoin(room, eq(bookings.roomId, room.id))
			.where(
				and(
					eq(paymentRefunds.status, 'succeeded'),
					gte(paymentRefunds.stripeCreatedAt, start),
					lt(paymentRefunds.stripeCreatedAt, end),
				),
			),
	]);

	return aggregateTaxReport(
		{ from, to },
		payments.map(({ id, at, amount, ...booking }) => ({
			id,
			at,
			amount,
			booking,
		})),
		refunds.map(({ id, at, amount, ...booking }) => ({
			id,
			// The range filter excludes rows with no Stripe date.
			at: at ?? start,
			amount,
			booking: linkedBooking(booking),
		})),
	);
}
