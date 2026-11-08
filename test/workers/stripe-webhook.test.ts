import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';
import { createStripe } from '@/lib/stripe';

import { db, fetchWorker, inboxItemsOfKind, insertBooking } from './helpers';
import {
	mockResend,
	mockStripePaymentIntents,
	paymentIntentObject,
} from './mocks';
import { ADMIN, GUEST } from './seed';

const WEBHOOK_URL = 'http://localhost/api/stripe/webhook';
const stripe = createStripe('sk_test_x');

async function signedRequest(event: object, secret = 'whsec_test') {
	const payload = JSON.stringify(event);
	const signature = await stripe.webhooks.generateTestHeaderStringAsync({
		payload,
		secret,
	});
	return new Request(WEBHOOK_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': signature,
		},
		body: payload,
	});
}

function paymentIntentSucceeded(pi: Parameters<typeof paymentIntentObject>[0]) {
	return {
		id: `evt_${pi.id}`,
		object: 'event',
		type: 'payment_intent.succeeded',
		api_version: '2026-10-28.endive',
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		data: { object: paymentIntentObject(pi) },
	};
}

async function pendingBookingWithIntent(piId: string) {
	return insertBooking({
		checkInDate: '2037-01-10',
		checkOutDate: '2037-01-12',
		status: 'pending',
		paymentStatus: 'pending',
		expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		stripePaymentIntentId: piId,
	});
}

async function bookingStatus(id: string) {
	const [row] = await db()
		.select({ status: bookings.status, paymentStatus: bookings.paymentStatus })
		.from(bookings)
		.where(eq(bookings.id, id));
	return row;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Stripe webhook signature', () => {
	it('rejects a missing signature with 400', async () => {
		const response = await fetchWorker(
			new Request(WEBHOOK_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			}),
		);
		expect(response.status).toBe(400);
	});

	it('rejects an invalid signature with 400', async () => {
		const request = await signedRequest({ type: 'x' }, 'whsec_wrong');
		const response = await fetchWorker(request);
		expect(response.status).toBe(400);
	});

	it('does not echo signature verification details', async () => {
		const request = await signedRequest({ type: 'x' }, 'whsec_wrong');
		const body = await (await fetchWorker(request)).text();
		expect(body).not.toMatch(/No signatures found|payload|expected/i);
	});

	it('returns 404 for other paths', async () => {
		const response = await fetchWorker(
			new Request('http://localhost/api/stripe/other', { method: 'POST' }),
		);
		expect(response.status).toBe(404);
	});
});

describe('payment_intent.succeeded', () => {
	it(
		'confirms the booking and emails the guest and admins once',
		{
			timeout: 20_000,
		},
		async () => {
			const booking = await pendingBookingWithIntent('pi_webhook_1');
			const pi = {
				id: 'pi_webhook_1',
				amount: Math.round(booking.totalAmount * 100),
				metadata: { bookingId: booking.id, userId: GUEST.id },
			};
			mockStripePaymentIntents(pi);
			const sent = mockResend();

			const response = await fetchWorker(
				await signedRequest(paymentIntentSucceeded(pi)),
			);
			expect(response.status).toBe(200);
			expect(await bookingStatus(booking.id)).toEqual({
				status: 'confirmed',
				paymentStatus: 'paid',
			});
			expect(
				sent.filter((e) => e.to.includes(booking.guestEmail)),
			).toHaveLength(1);
			expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);

			// Replay: idempotent, no second email.
			const replay = await fetchWorker(
				await signedRequest(paymentIntentSucceeded(pi)),
			);
			expect(replay.status).toBe(200);
			expect(sent).toHaveLength(2);
		},
	);

	it('acknowledges an intent with no matching booking', async () => {
		const response = await fetchWorker(
			await signedRequest(
				paymentIntentSucceeded({ id: 'pi_unknown', amount: 100 }),
			),
		);
		expect(response.status).toBe(200);
	});

	it(
		'does not log guest or admin email addresses',
		{
			timeout: 20_000,
		},
		async () => {
			const logged: string[] = [];
			for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
				vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
					logged.push(
						args
							.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
							.join(' '),
					);
				});
			}
			const booking = await pendingBookingWithIntent('pi_webhook_2');
			const pi = {
				id: 'pi_webhook_2',
				amount: Math.round(booking.totalAmount * 100),
				metadata: { bookingId: booking.id, userId: GUEST.id },
			};
			mockStripePaymentIntents(pi);
			mockResend();
			await fetchWorker(await signedRequest(paymentIntentSucceeded(pi)));

			const output = logged.join('\n');
			expect(output).not.toContain(booking.guestEmail);
			expect(output).not.toContain(ADMIN.email);
		},
	);
});

describe('charge.refunded', () => {
	it('records partial and full refunds made in Stripe', async () => {
		const booking = await insertBooking({
			checkInDate: '2037-03-10',
			checkOutDate: '2037-03-12',
			stripePaymentIntentId: 'pi_refunded_in_dashboard',
		});
		const charge = (amountRefunded: number) => ({
			id: 'evt_charge_refunded',
			object: 'event',
			type: 'charge.refunded',
			data: {
				object: {
					id: 'ch_1',
					object: 'charge',
					amount: 25000,
					amount_refunded: amountRefunded,
					payment_intent: 'pi_refunded_in_dashboard',
				},
			},
		});
		await fetchWorker(await signedRequest(charge(5000)));
		expect(await bookingStatus(booking.id)).toEqual({
			status: 'confirmed',
			paymentStatus: 'partially_refunded',
		});
		await fetchWorker(await signedRequest(charge(25000)));
		expect((await bookingStatus(booking.id)).paymentStatus).toBe('refunded');
	});
});

describe('refund.failed', () => {
	it('alerts the admins and adds one inbox item (replays update it)', async () => {
		const booking = await insertBooking({
			checkInDate: '2037-04-10',
			checkOutDate: '2037-04-12',
			stripePaymentIntentId: 'pi_refund_fails',
		});
		const sent = mockResend();
		const event = {
			id: 'evt_refund_failed',
			object: 'event',
			type: 'refund.failed',
			livemode: false,
			data: {
				object: {
					id: 're_fails_1',
					object: 'refund',
					amount: 12500,
					currency: 'usd',
					status: 'failed',
					failure_reason: 'expired_or_canceled_card',
					payment_intent: 'pi_refund_fails',
				},
			},
		};
		expect((await fetchWorker(await signedRequest(event))).status).toBe(200);
		expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);

		const [item] = await inboxItemsOfKind('refund_failed');
		expect(item).toMatchObject({
			source: 'stripe',
			status: 'new',
			bookingId: booking.id,
			userId: GUEST.id,
			dedupeKey: 'refund_failed:re_fails_1',
			occurrences: 1,
		});
		expect(item.details).toMatchObject({
			refundId: 're_fails_1',
			amount: 125,
			failureReason: 'expired_or_canceled_card',
			confirmationId: booking.confirmationId,
			livemode: false,
		});

		// A replay updates the same item (no duplicate).
		await fetchWorker(await signedRequest(event));
		const items = await inboxItemsOfKind('refund_failed');
		expect(items).toHaveLength(1);
		expect(items[0].occurrences).toBe(2);
	});
});
