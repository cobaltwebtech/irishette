import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import {
	bookingModifications,
	bookings,
	paymentRefunds,
	paymentTransactions,
} from '@/db/schema-export';
import { modifyBooking } from '@/lib/booking/modification-service';
import { getTaxReport } from '@/lib/reports/tax-report-service';
import {
	PAYMENT_RECOVERY_AFTER_MINUTES,
	scheduledPaymentRecovery,
} from '@/lib/server/scheduled-tasks';
import { createStripe } from '@/lib/stripe/stripe';
import { addDays } from '@/utils/date-range';

import {
	caller,
	db,
	fetchWorker,
	insertBooking,
	makeCtx,
	settle,
	trpcError,
	useClock,
} from './helpers';
import {
	mockEmail,
	mockStripeCheckout,
	mockStripeIntents,
	mockStripeRefunds,
	mockStripeRefundsStateful,
} from './mocks';
import { ADMIN, ROSE, TEXAS } from './seed';

// Admin-only reservation changes (plan 06): full reprice, the difference
// charged off-session to the saved card (authorize, claim, capture) or
// refunded across the payments; a decline falls back to a fresh card;
// shortening before check-in is refunded; once the stay has begun,
// release early frees the nights without a refund; cancellations refund
// across payments.

const admin = () => caller('admin');

/**
 * Stored amounts of `nights` at `nightly` with the seed rooms' rates (12%
 * fee; 6% state and 7% city tax on room + fee), with the tax snapshot.
 */
function pricedAt(nightly: number, nights = 2) {
	const c = (dollars: number) => Math.round(dollars * 100);
	const base = c(nightly * nights);
	const fees = Math.round(base * 0.12);
	const state = Math.round((base + fees) * 0.06);
	const city = Math.round((base + fees) * 0.07);
	return {
		baseAmount: base / 100,
		feesAmount: fees / 100,
		taxableAmount: (base + fees) / 100,
		stateTaxRate: 0.06,
		cityTaxRate: 0.07,
		stateTaxAmount: state / 100,
		cityTaxAmount: city / 100,
		taxAmount: (state + city) / 100,
		totalAmount: (base + fees + state + city) / 100,
		numberOfNights: nights,
	};
}

let day = 0;
/**
 * A confirmed, paid booking (real Rose Room prices and tax snapshot) with
 * its payment row (room / fee / tax split stored) and saved card.
 */
async function paidBooking(
	overrides: Parameters<typeof insertBooking>[0] = {},
) {
	day += 5;
	const checkIn = addDays('2033-06-01', day);
	const booking = await insertBooking({
		checkInDate: checkIn,
		checkOutDate: addDays(checkIn, 2),
		stripePaymentIntentId: `pi_orig_${day}`,
		stripeCustomerId: 'cus_guest',
		...pricedAt(ROSE.basePrice, overrides.numberOfNights ?? 2),
		...overrides,
	});
	await db()
		.insert(paymentTransactions)
		.values({
			bookingId: booking.id,
			stripePaymentIntentId: booking.stripePaymentIntentId,
			stripeChargeId: `ch_orig_${day}`,
			stripeCustomerId: 'cus_guest',
			amount: booking.totalAmount,
			status: 'paid',
			paymentMethod: 'card',
			stripePaymentMethodId: 'pm_saved',
			cardBrand: 'visa',
			cardLast4: '4242',
			roomAmount: booking.baseAmount,
			feesAmount: booking.feesAmount,
			taxableAmount: booking.taxableAmount,
			stateTaxAmount: booking.stateTaxAmount,
			cityTaxAmount: booking.cityTaxAmount,
			createdAt: new Date(Date.now() - 3_600_000),
		});
	return booking;
}

async function row(id: string) {
	const [r] = await db().select().from(bookings).where(eq(bookings.id, id));
	return r;
}

const payments = (bookingId: string) =>
	db()
		.select()
		.from(paymentTransactions)
		.where(eq(paymentTransactions.bookingId, bookingId));

const changes = (bookingId: string) =>
	db()
		.select()
		.from(bookingModifications)
		.where(eq(bookingModifications.bookingId, bookingId));

/** Quote then apply a change, as the admin page does. */
async function change(
	booking: { publicId: string },
	target: { roomId?: string; checkInDate: string; checkOutDate: string },
) {
	const input = { publicId: booking.publicId, roomId: ROSE.id, ...target };
	const quote = await admin().bookings.adminQuoteModification(input);
	const result = await admin().bookings.adminModifyBooking({
		...input,
		expectedDifferenceCents: quote.differenceCents,
		note: 'Guest called',
	});
	return { quote, result };
}

describe('increase charged to the saved card', () => {
	useClock('2033-05-01T15:00:00Z');

	it('extends the stay: authorize, claim, capture, record and email', async () => {
		const intents = mockStripeIntents();
		const sent = mockEmail();
		const booking = await paidBooking();
		const { quote, result } = await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		expect(quote.kind).toBe('extend');
		expect(quote.savedCard).toEqual({
			type: 'card',
			brand: 'visa',
			last4: '4242',
		});
		expect(quote.differenceCents).toBeGreaterThan(0);
		expect(result).toMatchObject({
			status: 'applied',
			differenceCents: quote.differenceCents,
		});
		if (result.status !== 'applied') throw new Error('not applied');

		const [{ body, idempotencyKey }] = intents.created;
		expect(body.get('amount')).toBe(String(quote.differenceCents));
		expect(body.get('off_session')).toBe('true');
		expect(body.get('confirm')).toBe('true');
		expect(body.get('capture_method')).toBe('manual');
		expect(body.get('customer')).toBe('cus_guest');
		expect(body.get('payment_method')).toBe('pm_saved');
		expect(body.get('metadata[reason]')).toBe('modification');
		expect(idempotencyKey).toBe(`modify/${result.modificationId}`);
		expect(intents.captures).toEqual([
			{
				intent: intents.ids[0],
				idempotencyKey: `capture-modify/${result.modificationId}`,
			},
		]);

		const after = await row(booking.id);
		expect(after).toMatchObject({
			checkOutDate: addDays(booking.checkOutDate, 1),
			numberOfNights: 3,
			totalAmount: quote.next.totalAmount,
			paymentStatus: 'paid',
			lastModificationId: result.modificationId,
		});
		const txs = await payments(booking.id);
		expect(txs).toHaveLength(2);
		expect(
			txs.find((t) => t.stripePaymentIntentId === intents.ids[0]),
		).toMatchObject({ amount: quote.differenceCents / 100, cardLast4: '4242' });
		const [mod] = await changes(booking.id);
		expect(mod).toMatchObject({
			kind: 'extend',
			status: 'applied',
			adminUserId: ADMIN.id,
			previousCheckOutDate: booking.checkOutDate,
			differenceCents: quote.differenceCents,
			stripePaymentIntentId: intents.ids[0],
			note: 'Guest called',
		});
		await settle();
		expect(
			sent.filter((e) => e.subject.startsWith('Reservation Changed')),
		).toHaveLength(2); // guest + admins
	});

	it('changes the room, repriced at the new room rates', async () => {
		mockStripeIntents();
		mockEmail();
		const booking = await paidBooking();
		const { quote, result } = await change(booking, {
			roomId: TEXAS.id,
			checkInDate: booking.checkInDate,
			checkOutDate: booking.checkOutDate,
		});
		expect(quote.kind).toBe('change_room');
		expect(result.status).toBe('applied');
		expect((await row(booking.id)).roomId).toBe(TEXAS.id);
		await settle();
	});

	it('a conflict at claim time cancels the authorization: nothing charged', async () => {
		const intents = mockStripeIntents();
		const booking = await paidBooking();
		const stale = await row(booking.id);
		const target = {
			roomId: ROSE.id,
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		};
		const quote = await admin().bookings.adminQuoteModification({
			publicId: booking.publicId,
			...target,
		});
		// Someone else changed the booking after it was read.
		await db()
			.update(bookings)
			.set({ updatedAt: new Date(Date.now() + 5_000) })
			.where(eq(bookings.id, booking.id));
		const error = await trpcError(
			modifyBooking(
				makeCtx('admin'),
				stale,
				{ target, expectedDifferenceCents: quote.differenceCents },
				ADMIN.id,
			),
		);
		expect(error.code).toBe('CONFLICT');
		expect(intents.cancels).toEqual(intents.ids);
		expect(intents.captures).toHaveLength(0);
		expect((await row(booking.id)).checkOutDate).toBe(booking.checkOutDate);
		expect(await changes(booking.id)).toHaveLength(0);
	});

	it('charges a saved Link method off-session', async () => {
		const intents = mockStripeIntents();
		mockEmail();
		const booking = await paidBooking();
		await db()
			.update(paymentTransactions)
			.set({
				paymentMethod: 'link',
				stripePaymentMethodId: 'pm_link',
				cardBrand: null,
				cardLast4: null,
			})
			.where(eq(paymentTransactions.bookingId, booking.id));
		const { quote, result } = await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		expect(quote.savedCard).toEqual({ type: 'link', brand: null, last4: null });
		expect(result).toMatchObject({ status: 'applied' });
		const [{ body }] = intents.created;
		expect(body.get('payment_method')).toBe('pm_link');
		expect(body.get('customer')).toBe('cus_guest');
		expect(body.get('off_session')).toBe('true');
		expect(intents.captures).toHaveLength(1);
	});

	it('refuses a stale price with CONFLICT and the new difference', async () => {
		const booking = await paidBooking();
		const error = await trpcError(
			admin().bookings.adminModifyBooking({
				publicId: booking.publicId,
				roomId: ROSE.id,
				checkInDate: booking.checkInDate,
				checkOutDate: addDays(booking.checkOutDate, 1),
				expectedDifferenceCents: 1,
			}),
		);
		expect(error.code).toBe('CONFLICT');
		expect(error.message).toMatch(/price difference is now/);
	});
});

describe('decline falls back to a fresh card', () => {
	useClock('2033-05-01T15:00:00Z');

	it('changes nothing on a decline, then applies the change paid with a new card', async () => {
		const intents = mockStripeIntents();
		const checkout = mockStripeCheckout();
		mockEmail();
		intents.fail('card_declined');
		const booking = await paidBooking();
		const target = {
			publicId: booking.publicId,
			roomId: ROSE.id,
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		};
		const { result, quote } = await change(booking, target);
		expect(result).toMatchObject({ status: 'card_required' });
		expect(result.status === 'card_required' && result.reason).toMatch(
			/declined/,
		);
		expect((await row(booking.id)).checkOutDate).toBe(booking.checkOutDate);
		expect(await changes(booking.id)).toHaveLength(0);

		const session = await admin().bookings.adminCreateModificationCheckout({
			...target,
			expectedDifferenceCents: quote.differenceCents,
		});
		expect(session.differenceCents).toBe(quote.differenceCents);
		const [{ body, session: fake }] = checkout.created;
		expect(body.get('metadata[kind]')).toBe('modification');
		expect(body.get('allowed_payment_method_types[0]')).toBe('card');
		expect(body.has('allowed_payment_method_types[1]')).toBe(false);
		expect(body.get('wallet_options[link][display]')).toBe('never');
		expect(fake.amount_total).toBe(quote.differenceCents);

		checkout.complete(fake.id);
		const applied = await admin().bookings.adminConfirmModificationCheckout({
			publicId: booking.publicId,
			sessionId: fake.id,
			note: 'New card by phone',
		});
		expect(applied.status).toBe('applied');
		// Idempotent (the webhook may run it too).
		await admin().bookings.adminConfirmModificationCheckout({
			publicId: booking.publicId,
			sessionId: fake.id,
		});
		expect(checkout.captures).toEqual([
			{
				intent: `pi_${fake.id}`,
				idempotencyKey: `capture-modify/${session.modificationId}`,
			},
		]);
		expect((await row(booking.id)).checkOutDate).toBe(
			addDays(booking.checkOutDate, 1),
		);
		const [mod] = await changes(booking.id);
		expect(mod).toMatchObject({ status: 'applied', note: 'New card by phone' });
		expect(await payments(booking.id)).toHaveLength(2);
		await settle();
	});
});

describe('fresh card through the webhook', () => {
	useClock('2033-05-01T15:00:00Z');

	it('checkout.session.completed applies the change once', async () => {
		const checkout = mockStripeCheckout();
		mockEmail();
		const booking = await paidBooking();
		const target = {
			publicId: booking.publicId,
			roomId: ROSE.id,
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		};
		const quote = await admin().bookings.adminQuoteModification(target);
		await admin().bookings.adminCreateModificationCheckout({
			...target,
			expectedDifferenceCents: quote.differenceCents,
		});
		const [{ session }] = checkout.created;
		checkout.complete(session.id);
		const payload = JSON.stringify({
			id: `evt_mod_${session.id}`,
			object: 'event',
			type: 'checkout.session.completed',
			created: Math.floor(Date.now() / 1000),
			livemode: false,
			data: { object: checkout.object(session.id) },
		});
		const stripe = createStripe('sk_test_x');
		const send = async () =>
			fetchWorker(
				new Request('http://localhost/api/stripe/webhook', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'stripe-signature':
							await stripe.webhooks.generateTestHeaderStringAsync({
								payload,
								secret: 'whsec_test',
							}),
					},
					body: payload,
				}),
			);
		expect((await send()).status).toBe(200);
		expect((await send()).status).toBe(200);
		expect(checkout.captures).toHaveLength(1);
		expect((await row(booking.id)).checkOutDate).toBe(target.checkOutDate);
		expect(await changes(booking.id)).toHaveLength(1);
		// The booking's own payment was not touched.
		expect(checkout.cancels).toHaveLength(0);
		await settle();
	});
});

describe('decrease refunded', () => {
	useClock('2033-05-01T15:00:00Z');

	it('refunds the difference on the payment, without counting it as a cancellation refund', async () => {
		const refunds = mockStripeRefunds();
		const sent = mockEmail();
		// Paid more than today's price for two nights: moving refunds the rest.
		const booking = await paidBooking(pricedAt(175));
		const { quote, result } = await change(booking, {
			checkInDate: addDays(booking.checkInDate, 1),
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		expect(quote.kind).toBe('move');
		expect(quote.differenceCents).toBeLessThan(0);
		expect(result.status).toBe('applied');
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get('payment_intent')).toBe(
			booking.stripePaymentIntentId,
		);
		expect(refunds[0].body.get('amount')).toBe(String(-quote.differenceCents));
		expect(refunds[0].body.get('metadata[reason]')).toBe('modification');
		const after = await row(booking.id);
		expect(after.paymentStatus).toBe('paid');
		expect(after.refundAmount ?? 0).toBe(0);
		const [mod] = await changes(booking.id);
		expect(mod.status).toBe('applied');
		expect(mod.stripeRefundId).toMatch(/^re_\d+$/);
		await settle();
		const guest = sent.find(
			(e) =>
				e.subject.startsWith('Reservation Changed') &&
				e.to.includes(booking.guestEmail),
		);
		expect(guest?.text).toContain('Refund');
		expect(guest?.text).not.toContain('Charged');
	});

	it('a refund Stripe could not create is retried by the recovery cron', async () => {
		const refunds = mockStripeRefundsStateful();
		mockEmail();
		const booking = await paidBooking(pricedAt(175));
		refunds.setUnavailable(true);
		await change(booking, {
			checkInDate: addDays(booking.checkInDate, 1),
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		expect((await changes(booking.id))[0].status).toBe('refund_pending');

		refunds.setUnavailable(false);
		const later = new Date(
			Date.now() + (PAYMENT_RECOVERY_AFTER_MINUTES + 1) * 60_000,
		);
		await scheduledPaymentRecovery(makeCtx(null), later);
		await scheduledPaymentRecovery(makeCtx(null), later);
		expect(refunds.created).toHaveLength(1);
		expect((await changes(booking.id))[0].status).toBe('applied');
		await settle();
	});
});

describe('rules and early release', () => {
	useClock('2033-05-01T15:00:00Z');

	it('shortens a stay before check-in: repriced, refunded, the night freed', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		const booking = await paidBooking();
		const { quote, result } = await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkInDate, 1),
		});
		expect(quote.kind).toBe('shorten');
		expect(quote.differenceCents).toBeLessThan(0);
		expect(result.status).toBe('applied');
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get('amount')).toBe(String(-quote.differenceCents));
		expect(await row(booking.id)).toMatchObject({
			checkOutDate: addDays(booking.checkInDate, 1),
			numberOfNights: 1,
			totalAmount: quote.next.totalAmount,
		});
		const calendar = await admin().availability.adminGetByRoom({
			roomPublicId: ROSE.publicId,
		});
		expect(
			calendar.unavailability.stays.some(
				(s) =>
					s.checkIn === booking.checkInDate &&
					s.checkOut === addDays(booking.checkInDate, 1),
			),
		).toBe(true);
		expect(
			calendar.unavailability.stays.some(
				(s) => s.checkOut === booking.checkOutDate,
			),
		).toBe(false);
		expect((await changes(booking.id))[0].kind).toBe('shorten');
		await settle();
	});

	it('once the stay has begun, shortening is refused (release early instead)', async () => {
		// Check-in Apr 30 at 4:00 PM CT; now is May 1, 10:00 AM CT.
		const booking = await paidBooking({
			checkInDate: '2033-04-30',
			checkOutDate: '2033-05-03',
			numberOfNights: 3,
		});
		const error = await trpcError(
			admin().bookings.adminQuoteModification({
				publicId: booking.publicId,
				roomId: ROSE.id,
				checkInDate: booking.checkInDate,
				checkOutDate: '2033-05-02',
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
		expect(error.message).toMatch(/release the room instead/);
	});

	it('release early is refused before check-in', async () => {
		const booking = await paidBooking();
		const error = await trpcError(
			admin().bookings.adminReleaseRoomEarly({
				publicId: booking.publicId,
				newCheckOutDate: addDays(booking.checkInDate, 1),
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
		expect(error.message).toMatch(/change the dates instead/);
	});

	it('refuses changes while the payment is authorized or refunds are pending', async () => {
		const booking = await paidBooking({ paymentStatus: 'authorized' });
		const error = await trpcError(
			admin().bookings.adminQuoteModification({
				publicId: booking.publicId,
				roomId: ROSE.id,
				checkInDate: booking.checkInDate,
				checkOutDate: addDays(booking.checkOutDate, 1),
			}),
		);
		expect(error.message).toMatch(/still being completed/);
	});

	it('releases the room early without moving money', async () => {
		const sent = mockEmail();
		const booking = await paidBooking({
			checkInDate: '2033-04-30',
			checkOutDate: '2033-05-04',
			numberOfNights: 4,
		});
		await admin().bookings.adminReleaseRoomEarly({
			publicId: booking.publicId,
			newCheckOutDate: '2033-05-02',
		});
		const after = await row(booking.id);
		expect(after).toMatchObject({
			checkOutDate: '2033-05-02',
			numberOfNights: 2,
			totalAmount: booking.totalAmount,
			paymentStatus: 'paid',
		});
		const [mod] = await changes(booking.id);
		expect(mod).toMatchObject({
			kind: 'release_early',
			differenceCents: 0,
			previousCheckOutDate: '2033-05-04',
		});
		const past = await trpcError(
			admin().bookings.adminReleaseRoomEarly({
				publicId: booking.publicId,
				newCheckOutDate: '2033-04-30',
			}),
		);
		expect(past.code).toBe('BAD_REQUEST');
		await settle();
		const notices = sent.filter((e) =>
			e.subject.startsWith('Reservation Changed'),
		);
		expect(notices).toHaveLength(2);
		for (const email of notices) expect(email.text).not.toContain('Charged');
	});

	it('non-admins cannot change reservations', async () => {
		const booking = await paidBooking();
		const error = await trpcError(
			caller('user').bookings.adminReleaseRoomEarly({
				publicId: booking.publicId,
				newCheckOutDate: booking.checkOutDate,
			}),
		);
		expect(error.code).toBe('FORBIDDEN');
	});
});

/** The booking's net tax and total in the tax report for the clock's days. */
async function reportedTax(confirmationId: string) {
	const report = await getTaxReport(
		{ db: db() },
		{ from: '2033-04-30', to: '2033-05-01' },
	);
	const rows = report.rows.filter((r) => r.confirmationId === confirmationId);
	return {
		rows,
		tax: rows.reduce((sum, r) => sum + r.stateTax + r.cityTax, 0),
		total: rows.reduce((sum, r) => sum + r.total, 0),
	};
}

describe('cancellation windows on fewer nights, and tax liability', () => {
	useClock('2033-05-01T15:00:00Z'); // May 1, 10:00 AM CT

	it('more than 7 days ahead: full refund; the refund lowers the tax', async () => {
		mockStripeRefunds();
		mockEmail();
		const booking = await paidBooking();
		const before = await reportedTax(booking.confirmationId);
		const { quote } = await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkInDate, 1),
		});
		expect(quote.refundPercent).toBe(100);
		expect(quote.differenceCents).toBe(quote.priceDifferenceCents);
		const after = await row(booking.id);
		const report = await reportedTax(booking.confirmationId);
		const refundRow = report.rows.find((r) => r.type === 'refund');
		expect(refundRow?.total).toBe(quote.differenceCents);
		expect(refundRow && refundRow.stateTax + refundRow.cityTax).toBeLessThan(0);
		// Net liability = the tax on the shorter stay.
		expect(report.total).toBe(Math.round(after.totalAmount * 100));
		expect(
			Math.abs(report.tax - Math.round((after.taxAmount ?? 0) * 100)),
		).toBeLessThanOrEqual(1);
		expect(report.tax).toBeLessThan(before.tax);
		await settle();
	});

	it('3 to 7 days ahead: tax back in full plus 75% of room and fee; the rest kept untaxed', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		const booking = await paidBooking({
			checkInDate: '2033-05-06',
			checkOutDate: '2033-05-08',
		});
		const { quote, result } = await change(booking, {
			checkInDate: '2033-05-06',
			checkOutDate: '2033-05-07',
		});
		expect(quote.refundPercent).toBe(75);
		// Texas: a kept percentage is not taxable, so all the tax on the
		// dropped night comes back, plus 75% of its room price and fee.
		const c = (dollars: number) => Math.round(dollars * 100);
		const preTaxDifference =
			c(booking.baseAmount + (booking.feesAmount ?? 0)) -
			c(quote.next.baseAmount + quote.next.feesAmount);
		const taxDifference = c(booking.taxAmount ?? 0) - c(quote.next.taxAmount);
		const expected = Math.round(preTaxDifference * 0.75) + taxDifference;
		expect(quote.differenceCents).toBe(-expected);
		expect(result.status).toBe('applied');
		expect(refunds[0].body.get('amount')).toBe(String(expected));
		const after = await row(booking.id);
		expect(after).toMatchObject({
			numberOfNights: 1,
			checkOutDate: '2033-05-07',
			totalAmount: (Math.round(booking.totalAmount * 100) - expected) / 100,
		});
		const [mod] = await changes(booking.id);
		expect(mod).toMatchObject({ kind: 'shorten', refundPercent: 75 });
		const report = await reportedTax(booking.confirmationId);
		expect(report.total).toBe(Math.round(after.totalAmount * 100));
		expect(
			Math.abs(report.tax - Math.round((after.taxAmount ?? 0) * 100)),
		).toBeLessThanOrEqual(1);
		await settle();
	});

	it('under 3 days: no refund, the night is still freed, tax unchanged', async () => {
		mockEmail();
		const booking = await paidBooking({
			checkInDate: '2033-05-03',
			checkOutDate: '2033-05-05',
		});
		const before = await reportedTax(booking.confirmationId);
		const { quote, result } = await change(booking, {
			checkInDate: '2033-05-03',
			checkOutDate: '2033-05-04',
		});
		expect(quote.refundPercent).toBe(0);
		expect(quote.differenceCents).toBe(0);
		expect(result.status).toBe('applied');
		expect(await row(booking.id)).toMatchObject({
			checkOutDate: '2033-05-04',
			numberOfNights: 1,
			totalAmount: booking.totalAmount,
		});
		const report = await reportedTax(booking.confirmationId);
		expect(report.tax + 0).toBe(before.tax + 0);
		await settle();
	});
});

describe('cancellations under the hotel tax rule', () => {
	useClock('2033-05-01T15:00:00Z'); // May 1, 10:00 AM CT

	const untaxed = (rows: Awaited<ReturnType<typeof reportedTax>>['rows']) =>
		rows.reduce((sum, r) => sum + r.room + r.fees - r.taxable, 0);

	it('3 to 7 days out: tax back in full plus 75% of room and fee; nothing taxed on what is kept', async () => {
		const refunds = mockStripeRefunds();
		mockEmail();
		// 2 nights: $200 room + $24 fee + $29.12 tax = $253.12.
		const booking = await paidBooking({
			checkInDate: '2033-05-06',
			checkOutDate: '2033-05-08',
		});
		const quote = await caller('user').bookings.getCancellationQuote({
			publicId: booking.publicId,
		});
		expect(quote.refundPercent).toBe(75);
		expect(quote.refundAmount).toBe(197.12); // $168 + $29.12
		await caller('user').bookings.cancelBooking({
			publicId: booking.publicId,
			expectedRefundAmount: 197.12,
		});
		expect(refunds[0].body.get('amount')).toBe('19712');
		const [stored] = await db()
			.select()
			.from(paymentRefunds)
			.where(eq(paymentRefunds.bookingId, booking.id));
		expect(stored).toMatchObject({
			roomAmount: 150,
			feesAmount: 18,
			taxableAmount: 224,
			stateTaxAmount: 13.44,
			cityTaxAmount: 15.68,
		});
		const report = await reportedTax(booking.confirmationId);
		expect(report.total).toBe(5600); // $56 kept
		expect(report.tax).toBe(0);
		expect(untaxed(report.rows)).toBe(5600);
		await settle();
	});

	it('under 3 days: nothing refunded, the full rate and its tax kept', async () => {
		mockEmail();
		const booking = await paidBooking({
			checkInDate: '2033-05-03',
			checkOutDate: '2033-05-05',
		});
		const quote = await caller('user').bookings.getCancellationQuote({
			publicId: booking.publicId,
		});
		expect(quote.refundAmount).toBe(0);
		await caller('user').bookings.cancelBooking({
			publicId: booking.publicId,
			expectedRefundAmount: 0,
		});
		const report = await reportedTax(booking.confirmationId);
		expect(report.tax).toBe(2912);
		expect(untaxed(report.rows)).toBe(0);
		await settle();
	});
});

describe('after an increase', () => {
	useClock('2033-05-01T15:00:00Z');

	it('a full cancellation refund is spread over both payments', async () => {
		const intents = mockStripeIntents();
		mockEmail();
		const booking = await paidBooking();
		const { quote } = await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		await settle();
		const refunds = mockStripeRefunds();
		const result = await admin().bookings.adminCancelBooking({
			publicId: booking.publicId,
			refund: 'full',
		});
		expect(result.refundAmount).toBe(quote.next.totalAmount);
		const byIntent = Object.fromEntries(
			refunds.map((r) => [r.body.get('payment_intent'), r.body.get('amount')]),
		);
		expect(byIntent).toEqual({
			[intents.ids[0]]: String(quote.differenceCents),
			[booking.stripePaymentIntentId ?? '']: String(
				Math.round(booking.totalAmount * 100),
			),
		});
		expect(await row(booking.id)).toMatchObject({
			status: 'cancelled',
			paymentStatus: 'refunded',
		});
		const txs = await payments(booking.id);
		expect(txs.every((t) => t.status === 'refunded')).toBe(true);
		await settle();
	});

	it('the tax report counts both payments in the booking proportions', async () => {
		mockStripeIntents();
		mockEmail();
		const booking = await paidBooking();
		await change(booking, {
			checkInDate: booking.checkInDate,
			checkOutDate: addDays(booking.checkOutDate, 1),
		});
		await settle();
		const after = await row(booking.id);
		const report = await getTaxReport(
			{ db: db() },
			{ from: '2033-04-30', to: '2033-05-01' },
		);
		const rows = report.rows.filter(
			(r) => r.confirmationId === booking.confirmationId,
		);
		expect(rows).toHaveLength(2);
		const totalCents = rows.reduce((sum, r) => sum + r.total, 0);
		expect(totalCents).toBe(Math.round(after.totalAmount * 100));
		const tax = rows.reduce((sum, r) => sum + r.stateTax + r.cityTax, 0);
		expect(
			Math.abs(tax - Math.round((after.taxAmount ?? 0) * 100)),
		).toBeLessThanOrEqual(2);
		// No refunds yet.
		expect(
			await db()
				.select()
				.from(paymentRefunds)
				.where(eq(paymentRefunds.bookingId, booking.id)),
		).toHaveLength(0);
	});
});
