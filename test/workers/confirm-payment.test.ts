import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { bookings } from '@/db/schema-export';
import { createStripe } from '@/lib/stripe';
import {
	caller,
	db,
	fetchWorker,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	settle,
	trpcError,
} from './helpers';
import {
	type FakePaymentIntent,
	mockResend,
	mockStripePaymentIntents,
	mockStripeRefunds,
	paymentIntentObject,
} from './mocks';
import { ADMIN, GUEST, OTHER_GUEST } from './seed';

// Confirmation must tie the PaymentIntent to the booking (metadata, amount,
// currency, user), re-check availability atomically, refund automatically if
// the dates were taken meanwhile, and be idempotent across the front-end
// confirm and the webhook.

const guest = () => caller('user');

let day = 0;
/** A pending booking on its own dates, with a PaymentIntent id. */
async function pendingBooking(piId: string) {
	day += 3;
	const checkIn = new Date(Date.UTC(2038, 0, day));
	const checkOut = new Date(Date.UTC(2038, 0, day + 2));
	return insertBooking({
		checkInDate: checkIn.toISOString().slice(0, 10),
		checkOutDate: checkOut.toISOString().slice(0, 10),
		status: 'pending',
		paymentStatus: 'pending',
		expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		stripePaymentIntentId: piId,
	});
}

function intentFor(
	booking: Awaited<ReturnType<typeof pendingBooking>>,
	overrides: Partial<FakePaymentIntent> = {},
): FakePaymentIntent {
	return {
		id: booking.stripePaymentIntentId as string,
		amount: Math.round(booking.totalAmount * 100),
		currency: 'usd',
		status: 'succeeded',
		metadata: { bookingId: booking.id, userId: GUEST.id },
		...overrides,
	};
}

async function row(id: string) {
	const [r] = await db().select().from(bookings).where(eq(bookings.id, id));
	return r;
}

describe('confirmPayment verification', () => {
	it('rejects an intent that has not succeeded', async () => {
		const booking = await pendingBooking('pi_not_succeeded');
		mockStripePaymentIntents(
			intentFor(booking, { status: 'requires_payment_method' }),
		);
		await trpcError(
			guest().bookings.confirmPayment({
				bookingId: booking.id,
				paymentIntentId: 'pi_not_succeeded',
			}),
		);
		expect((await row(booking.id)).status).toBe('pending');
	});

	it.each([
		[
			'booking id',
			{ metadata: { bookingId: 'someone-else', userId: GUEST.id } },
		],
		['amount', { amount: 1 }],
		['currency', { currency: 'eur' }],
		['user', { metadata: { bookingId: 'self', userId: OTHER_GUEST.id } }],
	] as const)(
		'rejects an intent with a mismatched %s',
		async (_label, overrides) => {
			const piId = `pi_mismatch_${_label.replace(' ', '_')}`;
			const booking = await pendingBooking(piId);
			const intent = intentFor(
				booking,
				overrides as Partial<FakePaymentIntent>,
			);
			if (intent.metadata?.bookingId === 'self') {
				intent.metadata = { ...intent.metadata, bookingId: booking.id };
			}
			mockStripePaymentIntents(intent);
			mockResend();
			await trpcError(
				guest().bookings.confirmPayment({
					bookingId: booking.id,
					paymentIntentId: piId,
				}),
			);
			expect((await row(booking.id)).status).toBe('pending');
		},
	);
});

describe('confirmation when the dates were taken meanwhile', () => {
	it('refunds automatically, cancels the booking and emails the admin', {
		timeout: 20_000,
	}, async () => {
		const booking = await pendingBooking('pi_taken');
		// An Airbnb reservation arrived via iCal sync after checkout started.
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: booking.checkInDate,
			endDate: booking.checkOutDate,
		});
		mockStripePaymentIntents(intentFor(booking));
		const refunds = mockStripeRefunds();
		const sent = mockResend();

		const error = await trpcError(
			guest().bookings.confirmPayment({
				bookingId: booking.id,
				paymentIntentId: 'pi_taken',
			}),
		);
		expect(error.code).toBe('CONFLICT');
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get('payment_intent')).toBe('pi_taken');
		const after = await row(booking.id);
		expect(after.status).toBe('cancelled');
		expect(after.paymentStatus).toBe('refunded');
		await settle();
		expect(sent.some((e) => e.to.includes(ADMIN.email))).toBe(true);
		expect(sent.some((e) => e.to.includes(booking.guestEmail))).toBe(true);
	});

	it('the webhook path refunds too, once, and returns 200', async () => {
		const booking = await pendingBooking('pi_taken_webhook');
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: booking.checkInDate,
			endDate: booking.checkOutDate,
		});
		const intent = intentFor(booking);
		mockStripePaymentIntents(intent);
		const refunds = mockStripeRefunds();
		mockResend();
		const stripe = createStripe('sk_test_x');
		const payload = JSON.stringify({
			id: 'evt_taken',
			object: 'event',
			type: 'payment_intent.succeeded',
			data: { object: paymentIntentObject(intent) },
		});
		const request = async () =>
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
			});
		expect((await fetchWorker(await request())).status).toBe(200);
		expect((await fetchWorker(await request())).status).toBe(200);
		expect(refunds).toHaveLength(1);
		expect((await row(booking.id)).cancellationReason).toBe(
			'dates_unavailable',
		);
	});
});

describe('idempotency', () => {
	it('front-end confirm, webhook and a repeated confirm send one confirmation', {
		timeout: 30_000,
	}, async () => {
		const booking = await pendingBooking('pi_idem');
		const intent = intentFor(booking);
		mockStripePaymentIntents(intent);
		const sent = mockResend();

		await guest().bookings.confirmPayment({
			bookingId: booking.id,
			paymentIntentId: 'pi_idem',
		});

		const stripe = createStripe('sk_test_x');
		const payload = JSON.stringify({
			id: 'evt_idem',
			object: 'event',
			type: 'payment_intent.succeeded',
			data: { object: paymentIntentObject(intent) },
		});
		const signature = await stripe.webhooks.generateTestHeaderStringAsync({
			payload,
			secret: 'whsec_test',
		});
		await fetchWorker(
			new Request('http://localhost/api/stripe/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'stripe-signature': signature,
				},
				body: payload,
			}),
		);

		await guest().bookings.confirmPayment({
			bookingId: booking.id,
			paymentIntentId: 'pi_idem',
		});

		await settle();
		expect((await row(booking.id)).status).toBe('confirmed');
		expect(sent.filter((e) => e.to.includes(booking.guestEmail))).toHaveLength(
			1,
		);
		expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);
	});
});
