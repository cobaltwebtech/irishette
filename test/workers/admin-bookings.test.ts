import { eq } from 'drizzle-orm';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vite-plus/test';

import { bookings, paymentTransactions, user } from '@/db/schema-export';
import { addDays } from '@/utils/date-range';
import { newId, newPublicId } from '@/utils/ids';

import {
	caller,
	db,
	insertBooking,
	settle,
	trpcError,
	useClock,
} from './helpers';
import { mockEmail, mockStripeCheckout } from './mocks';
import { network } from './network';
import { ADMIN, GUEST, ROSE } from './seed';

// Admin bookings by phone (plan 06): the guest account is found or created,
// the hold skips the same-day cutoff (a late same-day booking must be
// acknowledged and is non-refundable), the card is taken in a card-only
// session and the usual confirmation runs.

const admin = () => caller('admin');

/** The Stripe plugin looks for an existing customer when a user is created. */
function mockCustomerSearch() {
	network.use(
		http.get('https://api.stripe.com/v1/customers/search', () =>
			HttpResponse.json({ object: 'search_result', data: [], has_more: false }),
		),
	);
}

function adminInput(
	overrides: Partial<{
		checkInDate: string;
		checkOutDate: string;
		guestEmail: string;
		acknowledgeLateBooking: boolean;
	}> = {},
) {
	return {
		roomId: ROSE.id,
		checkInDate: '2033-04-01',
		checkOutDate: '2033-04-03',
		guestCount: 1,
		guestName: 'Phone Guest',
		guestEmail: 'phone.guest@example.test',
		guestPhone: '5555550177',
		estimatedArrival: '17:00' as const,
		internalNotes: 'Called from the office line',
		cardConsent: true as const,
		...overrides,
	};
}

async function bookingRow(id: string) {
	const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
	return row;
}

async function userByEmail(email: string) {
	const [row] = await db().select().from(user).where(eq(user.email, email));
	return row;
}

/** Hold, card-only session, guest pays, admin confirms. */
async function bookAndPay(input: ReturnType<typeof adminInput>) {
	const checkout = mockStripeCheckout();
	const hold = await admin().bookings.adminCreateBooking(input);
	const session = await admin().bookings.adminCreateCheckoutSession({
		bookingId: hold.bookingId,
	});
	expect(session.status).toBe('open');
	const [{ session: created }] = checkout.created;
	checkout.complete(created.id);
	const result = await admin().bookings.adminConfirmCheckout({
		publicId: hold.publicId,
		sessionId: created.id,
	});
	return { hold, result, checkout };
}

describe('adminCreateBooking', () => {
	useClock('2033-03-15T15:00:00Z'); // 10:00 CDT

	it('creates the guest account for a new email and records admin and consent', async () => {
		mockStripeCheckout();
		mockCustomerSearch();
		const hold = await admin().bookings.adminCreateBooking(adminInput());
		expect(hold.guestCreated).toBe(true);
		expect(hold.lateSameDay).toBe(false);
		const guest = await userByEmail('phone.guest@example.test');
		expect(guest).toMatchObject({
			name: 'Phone Guest',
			role: 'user',
			emailVerified: false,
			phoneNumber: '5555550177',
		});
		const row = await bookingRow(hold.bookingId);
		expect(row).toMatchObject({
			userId: guest.id,
			status: 'pending',
			createdByAdminId: ADMIN.id,
			lateSameDay: false,
			cardConsentBy: 'admin',
			internalNotes: 'Called from the office line',
		});
		expect(row.cardConsentAt).toBeInstanceOf(Date);
	});

	it('reuses an existing account (email matched case-insensitively)', async () => {
		const hold = await admin().bookings.adminCreateBooking(
			adminInput({
				guestEmail: GUEST.email.toUpperCase(),
				checkInDate: '2033-04-10',
				checkOutDate: '2033-04-12',
			}),
		);
		expect(hold.guestCreated).toBe(false);
		expect((await bookingRow(hold.bookingId)).userId).toBe(GUEST.id);
	});

	it('refuses a banned guest', async () => {
		await db().insert(user).values({
			id: newId(),
			publicId: newPublicId(),
			name: 'Banned Guest',
			email: 'banned@example.test',
			emailVerified: true,
			role: 'user',
			banned: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const error = await trpcError(
			admin().bookings.adminCreateBooking(
				adminInput({ guestEmail: 'banned@example.test' }),
			),
		);
		expect(error.code).toBe('FORBIDDEN');
	});

	it('requires the card-on-file consent and an admin', async () => {
		const noConsent = await trpcError(
			admin().bookings.adminCreateBooking({
				...adminInput(),
				cardConsent: false as unknown as true,
			}),
		);
		expect(noConsent.code).toBe('BAD_REQUEST');
		const notAdmin = await trpcError(
			caller('user').bookings.adminCreateBooking(adminInput()),
		);
		expect(notAdmin.code).toBe('FORBIDDEN');
	});

	it('looks a guest up by email without exposing internal ids', async () => {
		const found = await admin().bookings.adminFindGuest({
			email: GUEST.email,
		});
		expect(found).toMatchObject({ email: GUEST.email, banned: false });
		expect(found).not.toHaveProperty('id');
		expect(
			await admin().bookings.adminFindGuest({ email: 'nobody@example.test' }),
		).toBeNull();
	});
});

describe('payment and confirmation', () => {
	useClock('2033-03-15T15:00:00Z');

	it('takes a card-only session and confirms like a guest booking', async () => {
		const sent = mockEmail();
		const { hold, result, checkout } = await bookAndPay(
			adminInput({
				guestEmail: GUEST.email,
				checkInDate: '2033-05-01',
				checkOutDate: '2033-05-03',
			}),
		);
		expect(result.status).toBe('confirmed');
		const [{ body }] = checkout.created;
		expect(body.get('allowed_payment_method_types[0]')).toBe('card');
		expect(body.has('allowed_payment_method_types[1]')).toBe(false);
		// No Link sign-in or Link "Bank" tab for a card typed by an admin.
		expect(body.get('wallet_options[link][display]')).toBe('never');
		expect(body.get('payment_intent_data[setup_future_usage]')).toBe(
			'off_session',
		);
		const row = await bookingRow(hold.bookingId);
		expect(row).toMatchObject({
			status: 'confirmed',
			paymentStatus: 'paid',
			// Recorded at creation (verbal), not overwritten at the claim.
			cardConsentBy: 'admin',
		});
		const [tx] = await db()
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, hold.bookingId));
		expect(tx).toMatchObject({ cardBrand: 'visa', cardLast4: '4242' });
		await settle();
		// Guest confirmation + admin notification; no late notice.
		const mine = sent.filter((e) => e.subject.includes(row.confirmationId));
		expect(mine).toHaveLength(2);
	});
});

describe('late same-day bookings (after 4:00 PM CT)', () => {
	useClock('2033-03-15T21:30:00Z'); // 16:30 CDT
	const today = '2033-03-15';
	const tonight = adminInput({
		guestEmail: GUEST.email,
		checkInDate: today,
		checkOutDate: addDays(today, 1),
	});

	it('guests can no longer book today, admins can with an acknowledgement', async () => {
		const guestError = await trpcError(
			caller('user').bookings.createBooking({
				...tonight,
				totalAmount: 1,
			}),
		);
		expect(guestError.message).toMatch(/Same-day bookings close/);

		const quote = await admin().bookings.adminQuote({
			roomId: ROSE.id,
			checkInDate: today,
			checkOutDate: addDays(today, 1),
			guestCount: 1,
		});
		expect(quote.lateSameDay).toBe(true);

		const unacknowledged = await trpcError(
			admin().bookings.adminCreateBooking(tonight),
		);
		expect(unacknowledged.code).toBe('BAD_REQUEST');
		expect(unacknowledged.message).toMatch(/late booking with no refund/);

		const past = await trpcError(
			admin().bookings.adminCreateBooking({
				...tonight,
				checkInDate: addDays(today, -1),
				acknowledgeLateBooking: true,
			}),
		);
		expect(past.message).toMatch(/past/);
	});

	it('sends the late notice with the confirmation and refunds nothing under the policy', async () => {
		const sent = mockEmail();
		const { hold, result } = await bookAndPay({
			...tonight,
			acknowledgeLateBooking: true,
		});
		expect(result.status).toBe('confirmed');
		const row = await bookingRow(hold.bookingId);
		expect(row.lateSameDay).toBe(true);
		await settle();
		const mine = sent.filter((e) => e.subject.includes(row.confirmationId));
		expect(mine.map((e) => e.subject)).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Booking Confirmed/),
				expect.stringMatching(/^Late Same-Day Booking/),
			]),
		);
		expect(mine).toHaveLength(3);
	});

	it('a late same-day booking refunds nothing under the policy, in full only by an admin', async () => {
		// Check-in still ahead, so only the late flag makes the policy zero.
		const booking = await insertBooking({
			checkInDate: '2033-06-10',
			checkOutDate: '2033-06-12',
			lateSameDay: true,
		});
		const quote = await admin().bookings.getCancellationQuote({
			publicId: booking.publicId,
		});
		expect(quote.canCancel).toBe(true);
		expect(quote.refundAmount).toBe(0);
		expect(quote.refundPercent).toBe(0);
		expect(quote.refundableAmount).toBe(250);
	});

	it('the admin calendar opens today; the booking itself can be excluded', async () => {
		const data = await admin().availability.adminGetByRoom({
			roomPublicId: ROSE.publicId,
		});
		expect(data.today).toBe(today);
		expect(data.earliestCheckIn).toBe(today);
		const [booked] = await db()
			.select({ publicId: bookings.publicId })
			.from(bookings)
			.where(eq(bookings.checkInDate, today));
		expect(data.unavailability.stays.some((s) => s.checkIn === today)).toBe(
			true,
		);
		const without = await admin().availability.adminGetByRoom({
			roomPublicId: ROSE.publicId,
			excludeBookingPublicId: booked.publicId,
		});
		expect(without.unavailability.stays.some((s) => s.checkIn === today)).toBe(
			false,
		);
	});
});

describe('admin holds last 10 minutes', () => {
	useClock('2033-03-15T15:00:00Z');

	it('keeps the hold at 10 minutes while the session gets Stripe 35', async () => {
		const checkout = mockStripeCheckout();
		const hold = await admin().bookings.adminCreateBooking(
			adminInput({
				guestEmail: GUEST.email,
				checkInDate: '2033-06-01',
				checkOutDate: '2033-06-03',
			}),
		);
		const tenMinutes = new Date('2033-03-15T15:10:00Z');
		expect((await bookingRow(hold.bookingId)).expiresAt).toEqual(tenMinutes);
		const session = await admin().bookings.adminCreateCheckoutSession({
			bookingId: hold.bookingId,
		});
		expect(session.holdExpiresAt).toEqual(tenMinutes);
		expect((await bookingRow(hold.bookingId)).expiresAt).toEqual(tenMinutes);
		const [{ body }] = checkout.created;
		expect(Number(body.get('expires_at'))).toBe(
			Date.parse('2033-03-15T15:35:00Z') / 1000,
		);
	});

	it('adminReleaseHold expires the session and deletes the hold', async () => {
		const checkout = mockStripeCheckout();
		const hold = await admin().bookings.adminCreateBooking(
			adminInput({
				guestEmail: GUEST.email,
				checkInDate: '2033-06-05',
				checkOutDate: '2033-06-07',
			}),
		);
		await admin().bookings.adminCreateCheckoutSession({
			bookingId: hold.bookingId,
		});
		const released = await admin().bookings.adminReleaseHold({
			bookingId: hold.bookingId,
		});
		expect(released.outcome).toBe('released');
		expect(checkout.expired).toEqual([checkout.created[0].session.id]);
		expect(await bookingRow(hold.bookingId)).toBeUndefined();
	});

	it('a hold paid just before the release is confirmed, not deleted', async () => {
		const checkout = mockStripeCheckout();
		mockEmail();
		const hold = await admin().bookings.adminCreateBooking(
			adminInput({
				guestEmail: GUEST.email,
				checkInDate: '2033-07-01',
				checkOutDate: '2033-07-03',
			}),
		);
		await admin().bookings.adminCreateCheckoutSession({
			bookingId: hold.bookingId,
		});
		checkout.complete(checkout.created[0].session.id);
		const result = await admin().bookings.adminReleaseHold({
			bookingId: hold.bookingId,
		});
		expect(result.outcome).toBe('confirmed');
		expect((await bookingRow(hold.bookingId)).status).toBe('confirmed');
		await settle();
	});

	it("leaves a guest's own hold alone", async () => {
		const pending = await insertBooking({
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date('2033-03-15T15:30:00Z'),
		});
		const result = await admin().bookings.adminReleaseHold({
			bookingId: pending.id,
		});
		expect(result.outcome).toBe('unchanged');
		expect((await bookingRow(pending.id)).status).toBe('pending');
	});
});

describe('guest account pages list reservations only', () => {
	it('hides holds and holds cancelled before payment', async () => {
		const confirmed = await insertBooking({ confirmedAt: new Date() });
		const cancelledAfter = await insertBooking({
			status: 'cancelled',
			paymentStatus: 'refunded',
			confirmedAt: new Date(),
		});
		const hold = await insertBooking({
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 600_000),
		});
		const cancelledHold = await insertBooking({
			status: 'cancelled',
			paymentStatus: 'pending',
		});
		const mine = await caller('user').bookings.getMyBookings({
			limit: 100,
			offset: 0,
		});
		const ids = mine.map((r) => r.booking.publicId);
		expect(ids).toContain(confirmed.publicId);
		expect(ids).toContain(cancelledAfter.publicId);
		expect(ids).not.toContain(hold.publicId);
		expect(ids).not.toContain(cancelledHold.publicId);

		const detail = await caller('user').bookings.getBooking({
			publicId: hold.publicId,
		});
		expect(detail.listed).toBe(false);
		const shown = await caller('user').bookings.getBooking({
			publicId: confirmed.publicId,
		});
		expect(shown.listed).toBe(true);
	});
});
