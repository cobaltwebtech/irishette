import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import {
	bookings,
	paymentRefunds,
	paymentTransactions,
} from '@/db/schema-export';
import { HOLD_MINUTES } from '@/lib/availability';
import { createStripe } from '@/lib/stripe';

import {
	bookingInput,
	caller,
	db,
	fetchWorker,
	inboxItemsOfKind,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	settle,
	trpcError,
} from './helpers';
import { mockResend, mockStripeCheckout, mockStripeRefunds } from './mocks';
import { ADMIN, OTHER_GUEST } from './seed';

// Checkout Sessions (plan 02, 3.1-3.3): one session per hold, built from our
// pricing and linked to the booking; confirmation ties the session to the
// booking, re-checks availability atomically, refunds automatically if the
// dates were taken meanwhile, and is idempotent across the return page and
// the webhook.

const guest = () => caller('user');
const stripe = createStripe('sk_test_x');

let day = 0;
/** A pending booking on its own dates (a live hold). */
async function pendingBooking(
	overrides: Parameters<typeof insertBooking>[0] = {},
) {
	day += 3;
	const checkIn = new Date(Date.UTC(2038, 0, day));
	const checkOut = new Date(Date.UTC(2038, 0, day + 2));
	return insertBooking({
		checkInDate: checkIn.toISOString().slice(0, 10),
		checkOutDate: checkOut.toISOString().slice(0, 10),
		status: 'pending',
		paymentStatus: 'pending',
		expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		...overrides,
	});
}

async function row(id: string) {
	const [r] = await db().select().from(bookings).where(eq(bookings.id, id));
	return r;
}

/** A pending booking with an open session, paid ('paid') or processing. */
async function paidBooking(
	checkout: ReturnType<typeof mockStripeCheckout>,
	paymentStatus: 'paid' | 'unpaid' = 'paid',
	overrides: Parameters<typeof insertBooking>[0] = {},
) {
	const booking = await pendingBooking(overrides);
	const session = checkout.add({
		id: `cs_test_${booking.publicId}`,
		amount_total: Math.round(booking.totalAmount * 100),
		client_reference_id: booking.id,
		metadata: { bookingId: booking.id },
	});
	await db()
		.update(bookings)
		.set({ stripeSessionId: session.id })
		.where(eq(bookings.id, booking.id));
	checkout.complete(session.id, paymentStatus);
	return { booking, session };
}

async function webhook(type: string, object: object, id = `evt_${Date.now()}`) {
	const payload = JSON.stringify({
		id,
		object: 'event',
		type,
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		data: { object },
	});
	return fetchWorker(
		new Request('http://localhost/api/stripe/webhook', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'stripe-signature': await stripe.webhooks.generateTestHeaderStringAsync(
					{ payload, secret: 'whsec_test' },
				),
			},
			body: payload,
		}),
	);
}

describe('createCheckoutSession', () => {
	it('creates one session per hold from our pricing, linked to the booking', async () => {
		const checkout = mockStripeCheckout();
		const before = Date.now();
		const booking = await pendingBooking();
		const result = await guest().bookings.createCheckoutSession({
			bookingId: booking.id,
		});
		expect(result.status).toBe('open');
		expect(checkout.created).toHaveLength(1);
		const [{ body, idempotencyKey, session }] = checkout.created;

		expect(body.get('mode')).toBe('payment');
		expect(body.get('ui_mode')).toBe('elements');
		expect(body.get('client_reference_id')).toBe(booking.id);
		// Line items add up to the booking total exactly (no automatic_tax).
		expect(session.amount_total).toBe(Math.round(booking.totalAmount * 100));
		expect(body.has('automatic_tax[enabled]')).toBe(false);
		expect(body.get('line_items[0][price_data][product_data][name]')).toMatch(
			/Rose Room, 2 nights/,
		);
		// Ids only in metadata, on the session and the PaymentIntent.
		for (const prefix of ['metadata', 'payment_intent_data[metadata]']) {
			expect(body.get(`${prefix}[bookingId]`)).toBe(booking.id);
			expect(body.get(`${prefix}[bookingPublicId]`)).toBe(booking.publicId);
			expect(body.get(`${prefix}[confirmationId]`)).toBe(
				booking.confirmationId,
			);
			expect(body.get(`${prefix}[source]`)).toBe('irishette');
		}
		expect(body.get('payment_intent_data[description]')).toBe(
			`Irishette booking ${booking.confirmationId}`,
		);
		// No saved cards; dynamic payment methods.
		expect(body.get('saved_payment_method_options[payment_method_save]')).toBe(
			'disabled',
		);
		expect(body.has('payment_intent_data[setup_future_usage]')).toBe(false);
		expect(
			[...body.keys()].some((k) => k.startsWith('payment_method_types')),
		).toBe(false);
		expect(body.get('return_url')).toContain(
			`/booking/confirmation/${booking.publicId}?session_id={CHECKOUT_SESSION_ID}`,
		);
		expect(body.get('integration_identifier')).toMatch(
			/^irishette_booking_[a-z]{8}$/,
		);

		// The hold now expires with the session, HOLD_MINUTES from now.
		const after = await row(booking.id);
		expect(after.stripeSessionId).toBe(session.id);
		const expiresAt = Number(body.get('expires_at'));
		expect(after.expiresAt?.getTime()).toBe(expiresAt * 1000);
		expect(expiresAt * 1000).toBeGreaterThanOrEqual(
			Math.floor(before / 1000) * 1000 + HOLD_MINUTES * 60_000,
		);
		expect(idempotencyKey).toBe(
			`checkout/${booking.id}/${expiresAt}/${Math.round(booking.totalAmount * 100)}`,
		);
	});

	it('reuses the open session while the hold and amount are unchanged', async () => {
		const checkout = mockStripeCheckout();
		const booking = await pendingBooking();
		const first = await guest().bookings.createCheckoutSession({
			bookingId: booking.id,
		});
		const second = await guest().bookings.createCheckoutSession({
			bookingId: booking.id,
		});
		expect(checkout.created).toHaveLength(1);
		expect(second).toEqual(first);
	});

	it('expires the old session and creates a new one when the amount changed', async () => {
		const checkout = mockStripeCheckout();
		const booking = await pendingBooking();
		await guest().bookings.createCheckoutSession({ bookingId: booking.id });
		const oldId = checkout.created[0].session.id;
		await db()
			.update(bookings)
			.set({
				baseAmount: booking.baseAmount + 10,
				totalAmount: booking.totalAmount + 10,
			})
			.where(eq(bookings.id, booking.id));
		await guest().bookings.createCheckoutSession({ bookingId: booking.id });
		expect(checkout.expired).toEqual([oldId]);
		expect(checkout.created).toHaveLength(2);
		expect((await row(booking.id)).stripeSessionId).toBe(
			checkout.created[1].session.id,
		);
	});

	it('reports a session that was already paid and confirms the booking', async () => {
		const checkout = mockStripeCheckout();
		mockResend();
		const { booking } = await paidBooking(checkout);
		const result = await guest().bookings.createCheckoutSession({
			bookingId: booking.id,
		});
		expect(result.status).toBe('complete');
		expect((await row(booking.id)).status).toBe('confirmed');
		expect(checkout.created).toHaveLength(0);
		await settle();
	});

	it("refuses another guest's booking (NOT_FOUND)", async () => {
		mockStripeCheckout();
		const booking = await pendingBooking({ userId: OTHER_GUEST.id });
		const error = await trpcError(
			guest().bookings.createCheckoutSession({ bookingId: booking.id }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});
});

describe('confirmCheckout verification', () => {
	it('rejects a session that has not completed', async () => {
		const checkout = mockStripeCheckout();
		const booking = await pendingBooking();
		const session = checkout.add({
			id: `cs_test_open${booking.publicId}`,
			amount_total: Math.round(booking.totalAmount * 100),
			client_reference_id: booking.id,
			metadata: { bookingId: booking.id },
		});
		const error = await trpcError(
			guest().bookings.confirmCheckout({
				publicId: booking.publicId,
				sessionId: session.id,
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
		expect((await row(booking.id)).status).toBe('pending');
	});

	it.each([
		['booking id', { metadata: { bookingId: 'someone-else' } }],
		['client reference', { client_reference_id: 'someone-else' }],
		['amount', { amount_total: 1 }],
		['currency', { currency: 'eur' }],
	] as const)(
		'rejects a session with a mismatched %s',
		async (label, patch) => {
			const checkout = mockStripeCheckout();
			mockResend();
			const { booking, session } = await paidBooking(checkout);
			Object.assign(checkout.sessions.get(session.id) ?? {}, patch);
			const error = await trpcError(
				guest().bookings.confirmCheckout({
					publicId: booking.publicId,
					sessionId: session.id,
				}),
			);
			expect(error.code, label).toBe('BAD_REQUEST');
			expect((await row(booking.id)).status).toBe('pending');
		},
	);
});

describe('confirmation', () => {
	it('confirms, stores the payment ids and records the transaction', async () => {
		const checkout = mockStripeCheckout();
		const sent = mockResend();
		const { booking, session } = await paidBooking(checkout);
		const result = await guest().bookings.confirmCheckout({
			publicId: booking.publicId,
			sessionId: session.id,
		});
		expect(result.status).toBe('confirmed');
		const after = await row(booking.id);
		expect(after).toMatchObject({
			status: 'confirmed',
			paymentStatus: 'paid',
			stripeSessionId: session.id,
			stripePaymentIntentId: `pi_${session.id}`,
		});
		const [tx] = await db()
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, booking.id));
		expect(tx).toMatchObject({
			stripeCheckoutSessionId: session.id,
			stripePaymentIntentId: `pi_${session.id}`,
			stripeChargeId: `ch_pi_${session.id}`,
			paymentMethod: 'card',
			status: 'succeeded',
		});
		await settle();
		expect(
			sent.filter((e) => e.subject.includes(booking.confirmationId)),
		).toHaveLength(2); // guest confirmation + admin notification
	});

	it('a completed but unpaid session (delayed method) keeps the dates as processing', async () => {
		const checkout = mockStripeCheckout();
		const { booking, session } = await paidBooking(checkout, 'unpaid', {
			// The hold expires while the bank payment is pending.
			expiresAt: new Date(Date.now() - 60_000),
		});
		const result = await guest().bookings.confirmCheckout({
			publicId: booking.publicId,
			sessionId: session.id,
		});
		expect(result.status).toBe('processing');
		expect((await row(booking.id)).paymentStatus).toBe('processing');

		// Another guest can't hold the dates while the payment is processing.
		const error = await trpcError(
			caller('other').bookings.createBooking(
				bookingInput({
					checkInDate: booking.checkInDate,
					checkOutDate: booking.checkOutDate,
				}),
			),
		);
		expect(error.code).toBe('CONFLICT');

		// The cleanup cron and checkout.session.expired skip it.
		expect(
			(await webhook('checkout.session.expired', { id: session.id })).status,
		).toBe(200);
		expect(await row(booking.id)).toBeDefined();
	});

	it(
		'refunds automatically when the dates were taken meanwhile',
		{ timeout: 20_000 },
		async () => {
			const checkout = mockStripeCheckout();
			const refunds = mockStripeRefunds();
			const sent = mockResend();
			const { booking, session } = await paidBooking(checkout);
			// An Airbnb reservation arrived via iCal sync after checkout started.
			const feed = await insertFeed();
			await insertExternalEvent({
				feedId: feed.id,
				startDate: booking.checkInDate,
				endDate: booking.checkOutDate,
			});

			const result = await guest().bookings.confirmCheckout({
				publicId: booking.publicId,
				sessionId: session.id,
			});
			expect(result.status).toBe('refunded_conflict');
			expect(refunds).toHaveLength(1);
			expect(refunds[0].body.get('payment_intent')).toBe(`pi_${session.id}`);
			expect(refunds[0].body.get('metadata[bookingId]')).toBe(booking.id);
			expect(refunds[0].body.get('metadata[source]')).toBe('irishette');
			const after = await row(booking.id);
			expect(after.status).toBe('cancelled');
			expect(after.paymentStatus).toBe('refunded');
			const [refundRow] = await db()
				.select()
				.from(paymentRefunds)
				.where(eq(paymentRefunds.bookingId, booking.id));
			expect(refundRow.source).toBe('app');
			await settle();
			expect(sent.some((e) => e.to.includes(ADMIN.email))).toBe(true);
			expect(sent.some((e) => e.to.includes(booking.guestEmail))).toBe(true);
			const [item] = (await inboxItemsOfKind('refund_auto')).filter(
				(i) => i.bookingId === booking.id,
			);
			expect(item).toMatchObject({
				source: 'system',
				dedupeKey: `refund_auto:${booking.id}`,
			});
		},
	);

	it('the webhook path refunds too, once, and returns 200', async () => {
		const checkout = mockStripeCheckout();
		const refunds = mockStripeRefunds();
		mockResend();
		const { booking, session } = await paidBooking(checkout);
		const feed = await insertFeed();
		await insertExternalEvent({
			feedId: feed.id,
			startDate: booking.checkInDate,
			endDate: booking.checkOutDate,
		});
		const object = checkout.object(session.id);
		expect(
			(await webhook('checkout.session.completed', object, 'evt_t1')).status,
		).toBe(200);
		expect(
			(await webhook('checkout.session.completed', object, 'evt_t1')).status,
		).toBe(200);
		expect(refunds).toHaveLength(1);
		expect((await row(booking.id)).cancellationReason).toBe(
			'dates_unavailable',
		);
	});

	it(
		'return page, webhook and a repeated confirm send one confirmation',
		{ timeout: 30_000 },
		async () => {
			const checkout = mockStripeCheckout();
			const sent = mockResend();
			const { booking, session } = await paidBooking(checkout);
			const input = { publicId: booking.publicId, sessionId: session.id };

			await guest().bookings.confirmCheckout(input);
			await webhook('checkout.session.completed', checkout.object(session.id));
			const again = await guest().bookings.confirmCheckout(input);
			expect(again.status).toBe('already_confirmed');

			await settle();
			expect((await row(booking.id)).status).toBe('confirmed');
			expect(
				sent.filter((e) => e.to.includes(booking.guestEmail)),
			).toHaveLength(1);
			expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);
		},
	);
});

describe('first hold wins while it is live', () => {
	it("expires an expired hold's session and releases it for a new hold", async () => {
		const checkout = mockStripeCheckout();
		const old = await pendingBooking({
			userId: OTHER_GUEST.id,
			expiresAt: new Date(Date.now() - 60_000),
		});
		const session = checkout.add({ id: `cs_test_old${old.publicId}` });
		await db()
			.update(bookings)
			.set({ stripeSessionId: session.id })
			.where(eq(bookings.id, old.id));

		const created = await guest().bookings.createBooking(
			bookingInput({
				checkInDate: old.checkInDate,
				checkOutDate: old.checkOutDate,
			}),
		);
		expect(created.success).toBe(true);
		expect(checkout.expired).toContain(session.id);
		expect(await row(old.id)).toBeUndefined();
	});

	it('confirms an expired hold that was paid after all and refuses the new hold', async () => {
		const checkout = mockStripeCheckout();
		mockResend();
		const { booking: old } = await paidBooking(checkout, 'paid', {
			userId: OTHER_GUEST.id,
			expiresAt: new Date(Date.now() - 60_000),
		});
		const error = await trpcError(
			guest().bookings.createBooking(
				bookingInput({
					checkInDate: old.checkInDate,
					checkOutDate: old.checkOutDate,
				}),
			),
		);
		expect(error.code).toBe('CONFLICT');
		expect((await row(old.id)).status).toBe('confirmed');
	});
});
