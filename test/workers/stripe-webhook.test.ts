import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
	adminInboxItems,
	bookings,
	paymentDisputes,
	paymentRefunds,
	paymentTransactions,
} from '@/db/schema-export';
import { createStripe } from '@/lib/stripe/stripe';

import {
	caller,
	db,
	fetchWorker,
	inboxItemsOfKind,
	insertBooking,
	settle,
	trpcError,
} from './helpers';
import { mockResend, mockStripeCharges, mockStripeCheckout } from './mocks';
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

let eventCounter = 0;
/** A signed-able event envelope (ids and `created` increase per call). */
function event(
	type: string,
	object: object,
	{ id, created }: { id?: string; created?: number } = {},
) {
	eventCounter += 1;
	return {
		id: id ?? `evt_test_${eventCounter}_${Date.now()}`,
		object: 'event',
		type,
		api_version: '2026-10-28.endive',
		created: created ?? Math.floor(Date.now() / 1000) + eventCounter,
		livemode: false,
		data: { object },
	};
}

const send = async (e: object) => fetchWorker(await signedRequest(e));

let day = 0;
/** A pending booking on its own dates with a Checkout Session. */
async function pendingBookingWithSession(
	checkout: ReturnType<typeof mockStripeCheckout>,
	overrides: Parameters<typeof insertBooking>[0] = {},
) {
	day += 3;
	const checkIn = new Date(Date.UTC(2037, 0, day));
	const checkOut = new Date(Date.UTC(2037, 0, day + 2));
	const booking = await insertBooking({
		checkInDate: checkIn.toISOString().slice(0, 10),
		checkOutDate: checkOut.toISOString().slice(0, 10),
		status: 'pending',
		paymentStatus: 'pending',
		expiresAt: new Date(Date.now() + 20 * 60 * 1000),
		...overrides,
	});
	const session = checkout.add({
		id: `cs_test_wh${booking.publicId}`,
		amount_total: Math.round(booking.totalAmount * 100),
		client_reference_id: booking.id,
		metadata: { bookingId: booking.id, source: 'irishette' },
	});
	await db()
		.update(bookings)
		.set({ stripeSessionId: session.id })
		.where(eq(bookings.id, booking.id));
	return { booking, session };
}

/** A confirmed, paid booking with its payment transaction (charge ch_<pi>). */
async function paidBooking(piId: string) {
	day += 3;
	const checkIn = new Date(Date.UTC(2037, 6, day));
	const checkOut = new Date(Date.UTC(2037, 6, day + 2));
	const booking = await insertBooking({
		checkInDate: checkIn.toISOString().slice(0, 10),
		checkOutDate: checkOut.toISOString().slice(0, 10),
		stripePaymentIntentId: piId,
	});
	await db()
		.insert(paymentTransactions)
		.values({
			bookingId: booking.id,
			stripePaymentIntentId: piId,
			stripeChargeId: `ch_${piId}`,
			amount: booking.totalAmount,
			status: 'paid',
		});
	return booking;
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

describe('checkout.session.completed', () => {
	it(
		'confirms the booking and emails the guest and admins once',
		{ timeout: 20_000 },
		async () => {
			const checkout = mockStripeCheckout();
			const sent = mockResend();
			const { booking, session } = await pendingBookingWithSession(checkout);
			checkout.complete(session.id);
			const completed = event(
				'checkout.session.completed',
				checkout.object(session.id),
			);

			expect((await send(completed)).status).toBe(200);
			await settle();
			expect(await bookingStatus(booking.id)).toEqual({
				status: 'confirmed',
				paymentStatus: 'paid',
			});
			expect(
				sent.filter((e) => e.to.includes(booking.guestEmail)),
			).toHaveLength(1);
			expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);

			// Replay: idempotent, no second email.
			expect((await send(completed)).status).toBe(200);
			await settle();
			expect(sent).toHaveLength(2);
		},
	);

	it('an unpaid completed session (delayed method) marks the hold processing', async () => {
		const checkout = mockStripeCheckout();
		const { booking, session } = await pendingBookingWithSession(checkout);
		checkout.complete(session.id, 'unpaid');
		await send(
			event('checkout.session.completed', checkout.object(session.id)),
		);
		expect(await bookingStatus(booking.id)).toEqual({
			status: 'pending',
			paymentStatus: 'processing',
		});
	});

	it('acknowledges a session with no matching booking', async () => {
		const checkout = mockStripeCheckout();
		const session = checkout.add({ id: 'cs_test_unknown' });
		checkout.complete(session.id);
		const response = await send(
			event('checkout.session.completed', checkout.object(session.id)),
		);
		expect(response.status).toBe(200);
	});

	it(
		'does not log guest or admin email addresses',
		{ timeout: 20_000 },
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
			const checkout = mockStripeCheckout();
			mockResend();
			const { booking, session } = await pendingBookingWithSession(checkout);
			checkout.complete(session.id);
			await send(
				event('checkout.session.completed', checkout.object(session.id)),
			);
			await settle();

			const output = logged.join('\n');
			expect(output).not.toContain(booking.guestEmail);
			expect(output).not.toContain(ADMIN.email);
		},
	);
});

describe('delayed payments', () => {
	it('async_payment_succeeded confirms a processing hold', async () => {
		const checkout = mockStripeCheckout();
		mockResend();
		const { booking, session } = await pendingBookingWithSession(checkout, {
			paymentStatus: 'processing',
			expiresAt: new Date(Date.now() - 60_000),
		});
		checkout.complete(session.id, 'paid');
		await send(
			event(
				'checkout.session.async_payment_succeeded',
				checkout.object(session.id),
			),
		);
		await settle();
		expect(await bookingStatus(booking.id)).toEqual({
			status: 'confirmed',
			paymentStatus: 'paid',
		});
	});

	it('async_payment_failed releases the hold and emails the guest', async () => {
		const checkout = mockStripeCheckout();
		const sent = mockResend();
		const { booking, session } = await pendingBookingWithSession(checkout, {
			paymentStatus: 'processing',
		});
		checkout.complete(session.id, 'unpaid');
		await send(
			event(
				'checkout.session.async_payment_failed',
				checkout.object(session.id),
			),
		);
		await settle();
		expect((await bookingStatus(booking.id)).status).toBe('cancelled');
		const guestMail = sent.filter((e) => e.to.includes(booking.guestEmail));
		expect(guestMail).toHaveLength(1);
		expect(guestMail[0].subject).toContain('Payment not completed');
	});
});

describe('checkout.session.expired', () => {
	it('releases a pending hold, but not one that is processing', async () => {
		const checkout = mockStripeCheckout();
		const { booking, session } = await pendingBookingWithSession(checkout);
		const processing = await pendingBookingWithSession(checkout, {
			paymentStatus: 'processing',
		});
		await send(event('checkout.session.expired', { id: session.id }));
		await send(
			event('checkout.session.expired', { id: processing.session.id }),
		);
		expect(await bookingStatus(booking.id)).toBeUndefined();
		expect((await bookingStatus(processing.booking.id)).paymentStatus).toBe(
			'processing',
		);
	});
});

describe('charge.refunded', () => {
	it('records partial and full refunds made in Stripe (totals only)', async () => {
		const sent = mockResend();
		const booking = await paidBooking('pi_refunded_in_dashboard');
		const charge = (amountRefunded: number) =>
			event('charge.refunded', {
				id: 'ch_pi_refunded_in_dashboard',
				object: 'charge',
				amount: 25000,
				amount_refunded: amountRefunded,
				payment_intent: 'pi_refunded_in_dashboard',
			});
		await send(charge(5000));
		expect(await bookingStatus(booking.id)).toEqual({
			status: 'confirmed',
			paymentStatus: 'partially_refunded',
		});
		await send(charge(25000));
		expect((await bookingStatus(booking.id)).paymentStatus).toBe('refunded');
		await settle();
		expect(sent).toHaveLength(0);
	});
});

function refundObject(
	overrides: Partial<{
		id: string;
		amount: number;
		status: string;
		payment_intent: string;
		metadata: Record<string, string>;
		failure_reason: string;
		reference: string;
	}>,
) {
	return {
		id: 're_test_1',
		object: 'refund',
		amount: 25000,
		currency: 'usd',
		status: 'succeeded',
		reason: 'requested_by_customer',
		created: Math.floor(Date.now() / 1000),
		metadata: {},
		...overrides,
		charge: `ch_${overrides.payment_intent ?? 'pi_x'}`,
		destination_details: overrides.reference
			? { type: 'card', card: { reference: overrides.reference } }
			: undefined,
	};
}

describe('refunds made in the Stripe Dashboard', () => {
	it(
		'a full refund cancels the booking, emails guest and admins, and adds an inbox item',
		{ timeout: 20_000 },
		async () => {
			const sent = mockResend();
			const booking = await paidBooking('pi_dash_full');
			mockStripeCharges({
				id: 'ch_pi_dash_full',
				amount: 25000,
				amount_refunded: 25000,
				payment_intent: 'pi_dash_full',
			});
			const refund = refundObject({
				id: 're_dash_full',
				payment_intent: 'pi_dash_full',
			});
			expect((await send(event('refund.created', refund))).status).toBe(200);
			await settle();

			const [row] = await db()
				.select()
				.from(bookings)
				.where(eq(bookings.id, booking.id));
			expect(row).toMatchObject({
				status: 'cancelled',
				paymentStatus: 'refunded',
				refundAmount: 250,
				cancelledBy: 'system',
				cancellationReason: 'refunded_in_stripe',
			});
			const mail = sent.filter((e) =>
				e.subject.includes(booking.confirmationId),
			);
			expect(mail.some((e) => e.to.includes(booking.guestEmail))).toBe(true);
			expect(mail.some((e) => e.to.includes(ADMIN.email))).toBe(true);
			const [item] = (await inboxItemsOfKind('refund_issued')).filter(
				(i) => i.bookingId === booking.id,
			);
			expect(item).toMatchObject({
				source: 'stripe',
				status: 'new',
				userId: GUEST.id,
				dedupeKey: 'refund:re_dash_full',
			});
			expect(item.details).toMatchObject({
				refundId: 're_dash_full',
				status: 'succeeded',
				totalRefunded: 250,
				remainingPaid: 0,
				bookingStatus: 'cancelled',
			});
			const [stored] = await db()
				.select()
				.from(paymentRefunds)
				.where(eq(paymentRefunds.stripeRefundId, 're_dash_full'));
			expect(stored.source).toBe('dashboard');

			// Replays and a same-status update send nothing more.
			const before = sent.length;
			await send(event('refund.created', refund));
			await send(event('refund.updated', refund));
			await settle();
			expect(sent).toHaveLength(before);

			// The trace reference arriving later is worth one more email.
			await send(
				event('refund.updated', {
					...refund,
					...refundObject({
						id: 're_dash_full',
						payment_intent: 'pi_dash_full',
						reference: 'ARN123',
					}),
				}),
			);
			await settle();
			expect(sent.length).toBeGreaterThan(before);
		},
	);

	it('a partial refund keeps the booking confirmed and updates the amounts', async () => {
		mockResend();
		const booking = await paidBooking('pi_dash_partial');
		mockStripeCharges({
			id: 'ch_pi_dash_partial',
			amount: 25000,
			amount_refunded: 5000,
			payment_intent: 'pi_dash_partial',
		});
		await send(
			event(
				'refund.created',
				refundObject({
					id: 're_dash_partial',
					amount: 5000,
					payment_intent: 'pi_dash_partial',
				}),
			),
		);
		await settle();
		expect(await bookingStatus(booking.id)).toEqual({
			status: 'confirmed',
			paymentStatus: 'partially_refunded',
		});
		const [tx] = await db()
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, booking.id));
		expect(tx.amountRefunded).toBe(50);
	});

	it('refunds the app made only sync their status (no second email)', async () => {
		const sent = mockResend();
		const booking = await paidBooking('pi_app_refund');
		await send(
			event(
				'refund.created',
				refundObject({
					id: 're_app_1',
					payment_intent: 'pi_app_refund',
					metadata: { bookingId: booking.id, source: 'irishette' },
				}),
			),
		);
		await settle();
		expect(sent).toHaveLength(0);
		expect((await bookingStatus(booking.id)).status).toBe('confirmed');
		const [stored] = await db()
			.select()
			.from(paymentRefunds)
			.where(eq(paymentRefunds.stripeRefundId, 're_app_1'));
		expect(stored.source).toBe('app');
	});
});

describe('refund.failed', () => {
	it('alerts the admins once and adds one inbox item', async () => {
		const booking = await paidBooking('pi_refund_fails');
		const sent = mockResend();
		const failed = event(
			'refund.failed',
			refundObject({
				id: 're_fails_1',
				amount: 12500,
				status: 'failed',
				failure_reason: 'expired_or_canceled_card',
				payment_intent: 'pi_refund_fails',
			}),
		);
		expect((await send(failed)).status).toBe(200);
		await settle();
		expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);
		expect(sent.some((e) => e.to.includes(booking.guestEmail))).toBe(false);

		const [item] = await inboxItemsOfKind('refund_failed');
		expect(item).toMatchObject({
			source: 'stripe',
			status: 'new',
			bookingId: booking.id,
			userId: GUEST.id,
			dedupeKey: 'refund_failed:re_fails_1',
		});
		expect(item.details).toMatchObject({
			refundId: 're_fails_1',
			amount: 125,
			failureReason: 'expired_or_canceled_card',
			confirmationId: booking.confirmationId,
		});

		// refund.updated with the same failure, and replays: nothing new.
		await send({ ...failed, id: 'evt_other', type: 'refund.updated' });
		await send(failed);
		await settle();
		expect(await inboxItemsOfKind('refund_failed')).toHaveLength(1);
		expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);
	});
});

function disputeObject(
	overrides: Partial<{
		id: string;
		status: string;
		payment_intent: string | null;
		charge: string;
	}> = {},
) {
	return {
		id: 'dp_test_1',
		object: 'dispute',
		amount: 25000,
		currency: 'usd',
		charge: 'ch_pi_disputed',
		payment_intent: 'pi_disputed',
		created: Math.floor(Date.now() / 1000),
		reason: 'fraudulent',
		status: 'needs_response',
		is_charge_refundable: true,
		livemode: false,
		evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86_400 },
		payment_method_details: {
			type: 'card',
			card: {
				brand: 'visa',
				network_reason_code: '10.4',
				case_type: 'chargeback',
			},
		},
		...overrides,
	};
}

async function disputeItem(disputeId: string) {
	const [item] = await db()
		.select()
		.from(adminInboxItems)
		.where(eq(adminInboxItems.dedupeKey, `dispute:${disputeId}`));
	return item;
}

describe('charge.dispute.*', () => {
	it(
		'stores and links the dispute, notifies the inbox (no email) and resurfaces on newer events only',
		{ timeout: 20_000 },
		async () => {
			const sent = mockResend();
			const booking = await paidBooking('pi_disputed');
			mockStripeCharges({
				id: 'ch_pi_disputed',
				amount: 25000,
				payment_intent: 'pi_disputed',
				intentMetadata: { bookingId: booking.id },
				brand: 'visa',
				last4: '0259',
			});
			const t0 = Math.floor(Date.now() / 1000);
			const created = event('charge.dispute.created', disputeObject(), {
				created: t0,
			});
			expect((await send(created)).status).toBe(200);

			const [stored] = await db()
				.select()
				.from(paymentDisputes)
				.where(eq(paymentDisputes.stripeDisputeId, 'dp_test_1'));
			expect(stored).toMatchObject({
				bookingId: booking.id,
				userId: GUEST.id,
				amount: 250,
				reason: 'fraudulent',
				status: 'needs_response',
				networkReasonCode: '10.4',
				cardBrand: 'visa',
				cardLast4: '0259',
				lastStripeEventId: created.id,
			});
			let item = await disputeItem('dp_test_1');
			expect(item).toMatchObject({
				source: 'stripe',
				kind: 'payment_dispute',
				status: 'new',
				bookingId: booking.id,
				paymentDisputeId: stored.id,
			});
			expect(item.title).toContain(booking.confirmationId);
			expect(item.title).toContain('respond by');

			// The admin reads it; a replay changes nothing.
			await db()
				.update(adminInboxItems)
				.set({ status: 'read' })
				.where(eq(adminInboxItems.id, item.id));
			await send(created);
			expect((await disputeItem('dp_test_1')).status).toBe('read');

			// The guest can't cancel online and is never told about the dispute
			// (decision 2026-11-08); an admin refund needs confirmation.
			const guestError = await trpcError(
				caller('user').bookings.cancelBooking({ publicId: booking.publicId }),
			);
			expect(guestError.code).toBe('CONFLICT');
			expect(guestError.message).not.toMatch(/dispute|review/i);
			const guestQuote = await caller('user').bookings.getCancellationQuote({
				publicId: booking.publicId,
			});
			expect(guestQuote).toMatchObject({
				hasOpenDispute: false,
				canCancel: false,
				cancelBlocked: 'contact_us',
			});
			const guestView = await caller('user').bookings.getBooking({
				publicId: booking.publicId,
			});
			expect(guestView.booking.canCancel).toBe(false);
			expect(JSON.stringify(guestView)).not.toMatch(/dispute/i);
			const guestList = await caller('user').bookings.getMyBookings({
				limit: 100,
			});
			const listed = guestList.find(
				(r) => r.booking.publicId === booking.publicId,
			);
			expect(listed?.booking.canCancel).toBe(false);
			expect(JSON.stringify(listed)).not.toMatch(/dispute/i);
			const quote = await caller('admin').bookings.getCancellationQuote({
				publicId: booking.publicId,
			});
			expect(quote.hasOpenDispute).toBe(true);
			const adminError = await trpcError(
				caller('admin').bookings.adminCancelBooking({
					publicId: booking.publicId,
					refund: 'full',
				}),
			);
			expect(adminError.code).toBe('CONFLICT');

			// A newer event resurfaces it with the latest change.
			const updated = event(
				'charge.dispute.updated',
				disputeObject({ status: 'under_review' }),
				{ created: t0 + 10 },
			);
			await send(updated);
			item = await disputeItem('dp_test_1');
			expect(item.status).toBe('new');
			expect(item.details).toMatchObject({
				status: 'under_review',
				lastEvent: 'charge.dispute.updated',
			});

			// An older event arriving late changes nothing.
			await db()
				.update(adminInboxItems)
				.set({ status: 'read' })
				.where(eq(adminInboxItems.id, item.id));
			await send(
				event(
					'charge.dispute.updated',
					disputeObject({ status: 'needs_response' }),
					{
						created: t0 + 5,
					},
				),
			);
			expect((await disputeItem('dp_test_1')).status).toBe('read');
			const [after] = await db()
				.select({ status: paymentDisputes.status })
				.from(paymentDisputes)
				.where(eq(paymentDisputes.stripeDisputeId, 'dp_test_1'));
			expect(after.status).toBe('under_review');

			// Closed (lost): stored outcome, resurfaced.
			await send(
				event('charge.dispute.closed', disputeObject({ status: 'lost' }), {
					created: t0 + 20,
				}),
			);
			const [closed] = await db()
				.select()
				.from(paymentDisputes)
				.where(eq(paymentDisputes.stripeDisputeId, 'dp_test_1'));
			expect(closed.status).toBe('lost');
			expect(closed.closedAt).toBeInstanceOf(Date);
			item = await disputeItem('dp_test_1');
			expect(item.status).toBe('new');
			expect(item.title).toMatch(/Dispute lost/);

			// Closed disputes no longer block cancellation.
			const closedQuote = await caller('admin').bookings.getCancellationQuote({
				publicId: booking.publicId,
			});
			expect(closedQuote.hasOpenDispute).toBe(false);
			const guestAfter = await caller('user').bookings.getCancellationQuote({
				publicId: booking.publicId,
			});
			expect(guestAfter.cancelBlocked).toBeNull();

			await settle();
			expect(sent).toHaveLength(0);
			const items = (await inboxItemsOfKind('payment_dispute')).filter(
				(i) => i.dedupeKey === 'dispute:dp_test_1',
			);
			expect(items).toHaveLength(1);
		},
	);

	it('stores a dispute on a payment that matches no booking', async () => {
		mockStripeCharges({
			id: 'ch_unlinked',
			amount: 1000,
			payment_intent: 'pi_unlinked',
		});
		await send(
			event(
				'charge.dispute.created',
				disputeObject({
					id: 'dp_unlinked',
					charge: 'ch_unlinked',
					payment_intent: 'pi_unlinked',
				}),
			),
		);
		const [stored] = await db()
			.select()
			.from(paymentDisputes)
			.where(eq(paymentDisputes.stripeDisputeId, 'dp_unlinked'));
		expect(stored.bookingId).toBeNull();
		const item = await disputeItem('dp_unlinked');
		expect(item.bookingId).toBeNull();
		expect(item.title).toContain('unlinked payment');
	});

	it('links by the stored charge id when the charge lookup fails', async () => {
		const booking = await paidBooking('pi_disputed_fallback');
		mockStripeCharges(); // Stripe returns 404 for the charge
		await send(
			event(
				'charge.dispute.created',
				disputeObject({
					id: 'dp_fallback',
					charge: 'ch_pi_disputed_fallback',
					payment_intent: null,
				}),
			),
		);
		const [stored] = await db()
			.select()
			.from(paymentDisputes)
			.where(eq(paymentDisputes.stripeDisputeId, 'dp_fallback'));
		expect(stored.bookingId).toBe(booking.id);
	});
});
