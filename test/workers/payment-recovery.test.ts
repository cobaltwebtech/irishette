import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings, paymentTransactions } from '@/db/schema-export';
import {
	PAYMENT_RECOVERY_AFTER_MINUTES,
	scheduledPaymentRecovery,
} from '@/lib/server/scheduled-tasks';
import { addDays } from '@/utils/date-range';
import { dateInZone } from '@/utils/timezone';

import {
	caller,
	db,
	insertBooking,
	makeCtx,
	settle,
	trpcError,
	useClock,
} from './helpers';
import {
	mockEmail,
	mockStripeCheckout,
	mockStripeRefundsFailing,
	mockStripeRefundsStateful,
} from './mocks';

// Plan 05: payment work a stopped Worker leaves half done is finished by the
// 30-minute recovery cron (scheduledPaymentRecovery): uncaptured
// authorizations are captured (or released) and stuck cancellation refunds
// are created (or found and recorded), never twice.

const deps = () => makeCtx(null);
const later = () =>
	new Date(Date.now() + (PAYMENT_RECOVERY_AFTER_MINUTES + 1) * 60_000);

async function row(id: string) {
	const [r] = await db().select().from(bookings).where(eq(bookings.id, id));
	return r;
}

describe('authorized bookings', () => {
	it('captures a confirmed booking left authorized, after the grace period only', async () => {
		const checkout = mockStripeCheckout();
		const sent = mockEmail();
		const booking = await insertBooking({
			checkInDate: '2036-03-10',
			checkOutDate: '2036-03-12',
			paymentStatus: 'authorized',
			updatedAt: new Date(),
		});
		const session = checkout.add({
			id: `cs_test_rec${booking.publicId}`,
			amount_total: Math.round(booking.totalAmount * 100),
			client_reference_id: booking.id,
			metadata: { bookingId: booking.id, source: 'irishette' },
		});
		checkout.complete(session.id);
		await db()
			.update(bookings)
			.set({
				stripeSessionId: session.id,
				stripePaymentIntentId: `pi_${session.id}`,
			})
			.where(eq(bookings.id, booking.id));

		// Too recent: the webhook may still be working on it.
		await scheduledPaymentRecovery(deps(), new Date());
		expect(checkout.captures).toHaveLength(0);

		const result = await scheduledPaymentRecovery(deps(), later());
		expect(result).toEqual({ settled: 1, failed: 0 });
		expect(checkout.captures).toHaveLength(1);
		expect((await row(booking.id)).paymentStatus).toBe('paid');
		const payments = await db()
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, booking.id));
		expect(payments).toHaveLength(1);
		await settle();
		expect(sent.filter((e) => e.to.includes(booking.guestEmail))).toHaveLength(
			1,
		);
	});
});

describe('paid holds nothing confirmed (webhook down, tab closed)', () => {
	async function holdWithSession(
		checkout: ReturnType<typeof mockStripeCheckout>,
		checkInDate: string,
		expiresAt: Date,
	) {
		const hold = await insertBooking({
			checkInDate,
			checkOutDate: addDays(checkInDate, 2),
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt,
			updatedAt: new Date(),
		});
		const session = checkout.add({
			id: `cs_test_hold${hold.publicId}`,
			amount_total: Math.round(hold.totalAmount * 100),
			client_reference_id: hold.id,
			metadata: { bookingId: hold.id, source: 'irishette' },
		});
		await db()
			.update(bookings)
			.set({ stripeSessionId: session.id })
			.where(eq(bookings.id, hold.id));
		return { hold, session };
	}

	it('confirms and captures a hold whose session was paid', async () => {
		const checkout = mockStripeCheckout();
		const sent = mockEmail();
		const { hold, session } = await holdWithSession(
			checkout,
			'2036-05-10',
			new Date(Date.now() + 10 * 60_000),
		);
		checkout.complete(session.id);

		const result = await scheduledPaymentRecovery(deps(), later());
		expect(result).toEqual({ settled: 1, failed: 0 });
		expect(checkout.captures).toHaveLength(1);
		expect(await row(hold.id)).toMatchObject({
			status: 'confirmed',
			paymentStatus: 'paid',
		});
		await settle();
		expect(sent.filter((e) => e.to.includes(hold.guestEmail))).toHaveLength(1);
	});

	it('leaves a hold alone while its session is still open', async () => {
		const checkout = mockStripeCheckout();
		const { hold } = await holdWithSession(
			checkout,
			'2036-05-20',
			new Date(Date.now() + 10 * 60_000),
		);
		const result = await scheduledPaymentRecovery(deps(), later());
		expect(result).toEqual({ settled: 0, failed: 0 });
		expect(checkout.expired).toHaveLength(0);
		expect((await row(hold.id)).status).toBe('pending');
	});
});

describe('stuck cancellation refunds', () => {
	useClock('2034-08-20T17:00:00Z');
	const inDays = (n: number) =>
		dateInZone(new Date(Date.now() + n * 86_400_000));

	it(
		'a refund Stripe could not create stays pending, then the cron creates it once',
		{ timeout: 30_000 },
		async () => {
			const refunds = mockStripeRefundsStateful();
			mockEmail();
			const booking = await insertBooking({
				checkInDate: inDays(10),
				checkOutDate: inDays(12),
				stripePaymentIntentId: 'pi_recover_1',
			});
			await db().insert(paymentTransactions).values({
				bookingId: booking.id,
				stripePaymentIntentId: 'pi_recover_1',
				amount: booking.totalAmount,
				status: 'paid',
			});

			refunds.setUnavailable(true);
			const result = await caller('user').bookings.cancelBooking({
				publicId: booking.publicId,
			});
			// Not reported as failed: nothing to do by hand.
			expect(result).toMatchObject({ refundAmount: 250, refundFailed: false });
			expect(await row(booking.id)).toMatchObject({
				status: 'cancelled',
				paymentStatus: 'refund_pending',
				pendingRefundAmount: 250,
			});

			refunds.setUnavailable(false);
			await scheduledPaymentRecovery(deps(), later());
			await scheduledPaymentRecovery(deps(), later());
			expect(refunds.created).toHaveLength(1);
			expect(refunds.created[0].body.get('amount')).toBe('25000');
			expect(refunds.created[0].idempotencyKey).toBe(
				`refund-cancel/${booking.id}/25000`,
			);
			expect(await row(booking.id)).toMatchObject({
				paymentStatus: 'refunded',
				refundAmount: 250,
				pendingRefundAmount: null,
			});
			await settle();
		},
	);

	it('a refund created before a crash is found and recorded, not created again', async () => {
		const refunds = mockStripeRefundsStateful();
		const booking = await insertBooking({
			checkInDate: inDays(10),
			checkOutDate: inDays(12),
			status: 'cancelled',
			paymentStatus: 'refund_pending',
			pendingRefundAmount: 125,
			stripePaymentIntentId: 'pi_recover_2',
			updatedAt: new Date(),
		});
		refunds.existing.push({
			id: 're_before_crash',
			object: 'refund',
			status: 'succeeded',
			payment_intent: 'pi_recover_2',
			amount: 12500,
			currency: 'usd',
			created: Math.floor(Date.now() / 1000),
			metadata: { bookingId: booking.id, reason: 'cancellation' },
		});

		await scheduledPaymentRecovery(deps(), later());
		expect(refunds.created).toHaveLength(0);
		expect(await row(booking.id)).toMatchObject({
			paymentStatus: 'partially_refunded',
			refundAmount: 125,
			stripeRefundId: 're_before_crash',
			pendingRefundAmount: null,
		});
	});

	it('a booking whose capture is still under way cannot be cancelled yet', async () => {
		const refunds = mockStripeRefundsStateful();
		const booking = await insertBooking({
			checkInDate: inDays(10),
			checkOutDate: inDays(12),
			paymentStatus: 'authorized',
			stripePaymentIntentId: 'pi_recover_auth',
		});
		const error = await trpcError(
			caller('user').bookings.cancelBooking({ publicId: booking.publicId }),
		);
		expect(error.code).toBe('CONFLICT');
		expect(refunds.created).toHaveLength(0);
		expect(await row(booking.id)).toMatchObject({
			status: 'confirmed',
			paymentStatus: 'authorized',
		});
	});

	it('a refund Stripe refuses for good is refund_failed and not retried', async () => {
		const attempts = mockStripeRefundsFailing();
		mockEmail();
		const booking = await insertBooking({
			checkInDate: inDays(10),
			checkOutDate: inDays(12),
			stripePaymentIntentId: 'pi_recover_3',
		});
		const result = await caller('user').bookings.cancelBooking({
			publicId: booking.publicId,
		});
		expect(result.refundFailed).toBe(true);
		expect(await row(booking.id)).toMatchObject({
			paymentStatus: 'refund_failed',
			pendingRefundAmount: null,
		});
		await scheduledPaymentRecovery(deps(), later());
		expect(attempts).toHaveLength(1);
		await settle();
	});
});
