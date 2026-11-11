import { TRPCError } from '@trpc/server';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	paymentRefunds,
	paymentTransactions,
	room,
	user,
} from '@/db/schema-export';
import {
	sendAdminAlert,
	sendBookingConfirmedEmails,
	sendCancellationEmails,
	sendPaymentFailedEmail,
} from '@/lib/email/email-service';
import { syncRoomFeeds } from '@/lib/ical/ical-sync';
import { createInboxItemInBackground } from '@/lib/inbox/inbox-service';
import { inBackground, type ServiceDeps } from '@/lib/server/deps';
import {
	isPermanentStripeError,
	stripeBookingMetadata,
	stripeId,
	toCents,
} from '@/lib/stripe/stripe';
import { formatMoney } from '@/utils/format';

import {
	type Conflict,
	checkAvailability,
	HOLD_MINUTES,
	noOverlapForBookingRow,
} from './availability';
import { roundCents } from './pricing';

// Booking payments with Stripe Checkout Sessions (ui_mode 'elements': the
// Payment Element on our own page). One open session per hold, expiring with
// the hold. Fulfilment is driven by the webhook (src/lib/stripe/stripe-webhook.ts);
// the return page calls the same idempotent confirmation as a fast path.
// See docs/STRIPE_PAYMENT_INTEGRATION.md.

export type Booking = typeof bookings.$inferSelect;

/** Tags our sessions in the Stripe Dashboard (stripe-best-practices). */
const INTEGRATION_IDENTIFIER = 'irishette_booking_qzmvtrkd';

/** An open session is reused only if it has at least this long left. */
const REUSE_MIN_REMAINING_MS = 10 * 60_000;

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** Public conflict shape for guests: dates only, nothing about who booked. */
export function publicConflicts(conflicts: Conflict[]) {
	return conflicts.map((c) => ({ checkIn: c.checkIn, checkOut: c.checkOut }));
}

export async function loadBooking(db: Database, id: string) {
	const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
	return row;
}

export async function roomName(db: Database, roomId: string) {
	const [row] = await db
		.select({ name: room.name })
		.from(room)
		.where(eq(room.id, roomId));
	return { name: row?.name ?? 'Room' };
}

/** A Stripe "invalid request" (e.g. expiring a session that is not open). */
function isInvalidRequest(error: unknown): error is { statusCode?: number } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'type' in error &&
		(error as { type: string }).type === 'StripeInvalidRequestError'
	);
}

/** The session does not exist (e.g. another Stripe account or sandbox). */
const isMissing = (error: unknown) =>
	isInvalidRequest(error) && error.statusCode === 404;

/**
 * Expires an open Checkout Session so it can't be paid. Returns the session
 * as it is afterwards (it may have completed in the meantime).
 */
async function expireSession(
	stripe: Stripe,
	sessionId: string,
): Promise<Stripe.Checkout.Session> {
	try {
		return await stripe.checkout.sessions.expire(sessionId);
	} catch (error) {
		if (!isInvalidRequest(error)) throw error;
		// Not open any more: completed or already expired. Report which.
		return stripe.checkout.sessions.retrieve(sessionId);
	}
}

// --- Session creation --------------------------------------------------------

async function ensureStripeCustomer(
	{ db, stripe }: ServiceDeps,
	booking: Booking,
): Promise<string> {
	const [guest] = await db
		.select({ stripeCustomerId: user.stripeCustomerId })
		.from(user)
		.where(eq(user.id, booking.userId));
	if (guest?.stripeCustomerId) return guest.stripeCustomerId;
	const customer = await stripe.customers.create(
		{
			email: booking.guestEmail,
			name: booking.guestName,
			metadata: { userId: booking.userId },
		},
		{ idempotencyKey: `customer/${booking.userId}` },
	);
	await db
		.update(user)
		.set({ stripeCustomerId: customer.id })
		.where(eq(user.id, booking.userId));
	return customer.id;
}

/**
 * Checkout line items from OUR pricing (no automatic_tax): the room, the
 * service fee, and the state and city hotel taxes. They add up to the
 * booking total exactly. Zero lines are left out. The tax split is the one
 * stored on the booking; holds created before the snapshot columns existed
 * (null) are split from the room's rates on the room price, as they were
 * priced.
 */
export function checkoutLineItems(
	booking: Pick<
		Booking,
		'baseAmount' | 'feesAmount' | 'taxAmount' | 'numberOfNights'
	> &
		Partial<Pick<Booking, 'stateTaxAmount' | 'cityTaxAmount'>>,
	roomRow: { name: string; stateTaxRate: number; cityTaxRate: number },
): Stripe.Checkout.SessionCreateParams.LineItem[] {
	const tax = booking.taxAmount ?? 0;
	const hasSnapshot =
		booking.stateTaxAmount != null && booking.cityTaxAmount != null;
	const rates = roomRow.stateTaxRate + roomRow.cityTaxRate;
	// The city line takes any remainder so the lines always add up to the
	// stored tax amount.
	const stateTax = hasSnapshot
		? Math.min(tax, booking.stateTaxAmount ?? 0)
		: rates > 0
			? Math.min(tax, roundCents(booking.baseAmount * roomRow.stateTaxRate))
			: 0;
	const cityTax = roundCents(tax - stateTax);
	const nights = booking.numberOfNights;
	const lines: Array<[string, number]> = [
		[
			`${roomRow.name}, ${nights} night${nights === 1 ? '' : 's'}`,
			booking.baseAmount,
		],
		['Service fee', booking.feesAmount ?? 0],
		['State hotel occupancy tax', stateTax],
		['City hotel occupancy tax', cityTax],
	];
	return lines
		.filter(([, amount]) => amount > 0)
		.map(([name, amount]) => ({
			quantity: 1,
			price_data: {
				currency: 'usd',
				unit_amount: toCents(amount),
				product_data: { name },
			},
		}));
}

export type PrepareCheckoutResult =
	| { status: 'open'; clientSecret: string }
	/** The guest already paid (settled now): show the booking. */
	| { status: 'complete' };

/**
 * Returns the client secret of the hold's Checkout Session, creating one if
 * needed. Checks the hold is live, syncs the room's import feeds (best
 * effort) and re-checks the dates first. Reuses the open session while the
 * hold expiry and the amount are unchanged; otherwise expires it and creates
 * a new one, extending the hold to HOLD_MINUTES so the session (which expires
 * with the hold) gets Stripe's 30-minute minimum.
 */
export async function prepareCheckout(
	deps: ServiceDeps,
	booking: Booking,
	now = new Date(),
): Promise<PrepareCheckoutResult> {
	const { db, stripe } = deps;
	if (booking.status !== 'pending') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking is not awaiting payment',
		});
	}
	if (booking.paymentStatus === 'processing') return { status: 'complete' };
	if (!booking.expiresAt || booking.expiresAt <= now) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'Your hold on these dates expired. Please refresh the booking.',
		});
	}

	// Pick up reservations made on other platforms since the last cron run.
	await syncRoomFeeds(deps, booking.roomId, { trigger: 'checkout' }).catch(
		(error: unknown) => {
			console.warn(
				'Pre-payment feed sync failed:',
				error instanceof Error ? error.message : 'Unknown error',
			);
		},
	);
	const availability = await checkAvailability(
		db,
		booking.roomId,
		booking.checkInDate,
		booking.checkOutDate,
		{ excludeBookingId: booking.id, now },
	);
	if (!availability.available) {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'These dates were just booked elsewhere. Please choose other dates.',
			cause: { conflicts: publicConflicts(availability.conflicts) },
		});
	}

	const amount = toCents(booking.totalAmount);
	if (booking.stripeSessionId) {
		const existing = await stripe.checkout.sessions.retrieve(
			booking.stripeSessionId,
		);
		if (existing.status === 'complete') {
			await confirmBookingPayment(deps, booking.id, existing.id, now);
			return { status: 'complete' };
		}
		const reusable =
			existing.status === 'open' &&
			existing.amount_total === amount &&
			existing.expires_at === seconds(booking.expiresAt) &&
			booking.expiresAt.getTime() - now.getTime() >= REUSE_MIN_REMAINING_MS &&
			existing.client_secret;
		if (reusable) return { status: 'open', clientSecret: reusable };
		if (existing.status === 'open') {
			const after = await expireSession(stripe, existing.id);
			if (after.status === 'complete') {
				await confirmBookingPayment(deps, booking.id, after.id, now);
				return { status: 'complete' };
			}
		}
	}

	return createSession(deps, booking, amount, now);
}

async function createSession(
	deps: ServiceDeps,
	booking: Booking,
	amount: number,
	now: Date,
): Promise<PrepareCheckoutResult> {
	const { db, stripe, env } = deps;
	const [roomRow] = await db
		.select({
			name: room.name,
			stateTaxRate: room.stateTaxRate,
			cityTaxRate: room.cityTaxRate,
		})
		.from(room)
		.where(eq(room.id, booking.roomId));
	if (!roomRow) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
	}
	const customer = await ensureStripeCustomer(deps, booking);
	const expiresAt = new Date((seconds(now) + HOLD_MINUTES * 60) * 1000);
	const metadata = stripeBookingMetadata(booking);
	const session = await stripe.checkout.sessions.create(
		{
			mode: 'payment',
			ui_mode: 'elements',
			customer,
			client_reference_id: booking.id,
			line_items: checkoutLineItems(booking, roomRow),
			metadata,
			// Authorize only: the card is charged (captured) after the booking
			// is confirmed, and an authorization the app can't confirm is
			// cancelled, never refunded (plan 05). Only methods that support a
			// separate capture without charging up front: cards (Apple Pay and
			// Google Pay included) and Link. No delayed bank payments. A filter
			// on the methods enabled in the Dashboard, not a static list.
			allowed_payment_method_types: ['card', 'link'],
			payment_intent_data: {
				capture_method: 'manual',
				metadata,
				description: `Irishette booking ${booking.confirmationId}`,
			},
			// No saved cards (plan 02 decision).
			saved_payment_method_options: { payment_method_save: 'disabled' },
			return_url: `${env.BETTER_AUTH_URL}/booking/confirmation/${booking.publicId}?session_id={CHECKOUT_SESSION_ID}`,
			expires_at: seconds(expiresAt),
			integration_identifier: INTEGRATION_IDENTIFIER,
		},
		{
			idempotencyKey: `checkout/${booking.id}/${seconds(expiresAt)}/${amount}`,
		},
	);
	if (session.amount_total !== amount || !session.client_secret) {
		await expireSession(stripe, session.id);
		console.error(
			`Checkout Session ${session.id} total ${session.amount_total} does not match booking ${booking.confirmationId} (${amount})`,
		);
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'The payment could not be prepared. Please try again.',
		});
	}

	// Save the session and extend the hold to its expiry in one guarded
	// write. If another request saved a session first (double submit), use
	// that one and expire ours.
	const [saved] = await db
		.update(bookings)
		.set({ stripeSessionId: session.id, expiresAt, updatedAt: now })
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				booking.stripeSessionId
					? eq(bookings.stripeSessionId, booking.stripeSessionId)
					: isNull(bookings.stripeSessionId),
			),
		)
		.returning({ id: bookings.id });
	if (saved) return { status: 'open', clientSecret: session.client_secret };

	const current = await loadBooking(db, booking.id);
	if (current?.stripeSessionId === session.id) {
		return { status: 'open', clientSecret: session.client_secret };
	}
	await expireSession(stripe, session.id);
	if (current?.status !== 'pending' || !current.stripeSessionId) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: 'This booking changed. Please reload and try again.',
		});
	}
	const theirs = await stripe.checkout.sessions.retrieve(
		current.stripeSessionId,
	);
	if (theirs.status === 'open' && theirs.client_secret) {
		return { status: 'open', clientSecret: theirs.client_secret };
	}
	return { status: 'complete' };
}

// --- Holds and their sessions ----------------------------------------------------

/**
 * Makes sure a pending hold's Checkout Session can no longer be paid, before
 * the hold is released. A session the guest completed in the meantime is
 * settled by confirmBookingPayment (captured, or its authorization released).
 * Returns 'paid' when the booking ended confirmed, or when its payment state
 * is unknown (Stripe failed): the hold must then not be released.
 */
export async function closeHoldSession(
	deps: ServiceDeps,
	hold: Pick<Booking, 'id' | 'stripeSessionId' | 'paymentStatus'>,
	now = new Date(),
): Promise<'closed' | 'paid'> {
	// Legacy: delayed bank payments are no longer offered (plan 05).
	if (hold.paymentStatus === 'processing') return 'paid';
	if (!hold.stripeSessionId) return 'closed';
	let session: Stripe.Checkout.Session;
	try {
		session = await deps.stripe.checkout.sessions.retrieve(
			hold.stripeSessionId,
		);
	} catch (error) {
		// A session Stripe does not know can't be paid.
		if (isMissing(error)) return 'closed';
		throw error;
	}
	const after =
		session.status === 'open'
			? await expireSession(deps.stripe, session.id)
			: session;
	if (after.status !== 'complete') return 'closed';
	try {
		const outcome = await confirmBookingPayment(deps, hold.id, after.id, now);
		return isConfirmed(outcome) ? 'paid' : 'closed';
	} catch (error) {
		console.error(
			`Paid hold ${hold.id} could not be settled:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return 'paid';
	}
}

/**
 * Payment recovery: a pending hold whose session the guest completed, but
 * no confirmation ran (the webhook kept failing and the guest closed the
 * tab before the return page). Confirms and captures it. Leaves an open
 * session alone (the guest may still be paying). True if it was settled.
 */
export async function settlePaidHold(
	deps: ServiceDeps,
	hold: Pick<Booking, 'id' | 'stripeSessionId'>,
	now = new Date(),
): Promise<boolean> {
	if (!hold.stripeSessionId) return false;
	let session: Stripe.Checkout.Session;
	try {
		session = await deps.stripe.checkout.sessions.retrieve(
			hold.stripeSessionId,
		);
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
	if (session.status !== 'complete') return false;
	await confirmBookingPayment(deps, hold.id, session.id, now);
	return true;
}

/**
 * A session expired (checkout.session.expired): release the hold if it is
 * still pending and nothing is processing. Only the hold's current session
 * counts (older sessions were expired on purpose).
 */
export async function releaseExpiredSessionHold(
	{ db }: ServiceDeps,
	sessionId: string,
) {
	const deleted = await db
		.delete(bookings)
		.where(
			and(
				eq(bookings.stripeSessionId, sessionId),
				eq(bookings.status, 'pending'),
				or(
					isNull(bookings.paymentStatus),
					ne(bookings.paymentStatus, 'processing'),
				),
			),
		)
		.returning({ confirmationId: bookings.confirmationId });
	return deleted[0]?.confirmationId ?? null;
}

// --- Confirmation: authorize, claim the dates, capture (plan 05) ------------------

/**
 * - confirmed / already_confirmed: the booking is confirmed with this
 *   session and the payment captured (or the capture is under way on a
 *   retry).
 * - released: the booking could not be confirmed (dates taken, booking
 *   cancelled or paid with another session); the card authorization was
 *   cancelled, nothing was charged.
 * - payment_failed: the authorization could not be captured (expired or
 *   cancelled); the booking was cancelled, nothing was charged.
 */
export type ConfirmationOutcome =
	| { status: 'confirmed'; booking: Booking }
	| { status: 'already_confirmed'; booking: Booking }
	| { status: 'released'; booking: Booking }
	| { status: 'payment_failed'; booking: Booking };

const isConfirmed = (outcome: ConfirmationOutcome) =>
	outcome.status === 'confirmed' || outcome.status === 'already_confirmed';

const notPaid = () =>
	new TRPCError({ code: 'BAD_REQUEST', message: 'Payment has not completed' });

const cannotPay = () =>
	new TRPCError({
		code: 'BAD_REQUEST',
		message: 'This booking can no longer be paid',
	});

/** Why a session can't pay for this booking, or null when it matches. */
function sessionMismatch(session: Stripe.Checkout.Session, booking: Booking) {
	const mismatch =
		session.metadata?.bookingId !== booking.id ||
		session.client_reference_id !== booking.id ||
		session.amount_total !== toCents(booking.totalAmount) ||
		session.currency !== 'usd' ||
		session.mode !== 'payment';
	return mismatch ? 'The payment does not match the booking' : null;
}

/** The PaymentIntent of a session retrieved with `expand: ['payment_intent']`. */
function sessionIntent(session: Stripe.Checkout.Session) {
	const pi = session.payment_intent;
	return pi && typeof pi === 'object' ? pi : null;
}

/**
 * Where the money is, from the PaymentIntent (the source of truth; the
 * session's payment_status is not used for manual capture).
 */
type IntentState = 'authorized' | 'captured' | 'canceled' | 'unpaid';

function intentState(intent: Stripe.PaymentIntent | null): IntentState {
	switch (intent?.status) {
		case 'requires_capture':
			return 'authorized';
		case 'succeeded':
			return 'captured';
		case 'canceled':
			return 'canceled';
		default:
			return 'unpaid';
	}
}

function paymentMethodType(intent: Stripe.PaymentIntent | null) {
	const pm = intent?.payment_method;
	if (pm && typeof pm === 'object') return pm.type;
	return intent?.payment_method_types?.[0] ?? 'card';
}

/** The payment row for this session exists (confirmation fully recorded). */
async function hasPaymentRow(
	db: Database,
	bookingId: string,
	sessionId: string,
) {
	const [row] = await db
		.select({ id: paymentTransactions.id })
		.from(paymentTransactions)
		.where(
			and(
				eq(paymentTransactions.bookingId, bookingId),
				eq(paymentTransactions.stripeCheckoutSessionId, sessionId),
			),
		);
	return Boolean(row);
}

/** Confirmed with this session, captured and recorded: nothing left to do. */
async function isFullyConfirmed(
	db: Database,
	booking: Booking,
	sessionId: string,
) {
	return (
		booking.status === 'confirmed' &&
		booking.stripeSessionId === sessionId &&
		booking.paymentStatus !== 'authorized' &&
		(await hasPaymentRow(db, booking.id, sessionId))
	);
}

/**
 * Settles a booking's completed Checkout Session. Called by the webhook
 * (checkout.session.completed), the return page (bookings.confirmCheckout),
 * prepareCheckout, the hold cleanup and the payment recovery cron;
 * idempotent across all, and safe to re-run after a crash at any step.
 *
 * The card is only authorized at checkout (capture_method 'manual'), so no
 * money moves until the dates are ours:
 * 1. Retrieve the session with its PaymentIntent; check it belongs to this
 *    booking (metadata, client_reference_id, amount, currency).
 * 2. Claim: one guarded UPDATE confirms the booking (payment 'authorized')
 *    only if it is still pending and nothing took the dates meanwhile.
 * 3. Capture the authorization (idempotency key per booking and intent).
 * 4. Mark it paid, record the payment row and send the confirmation emails
 *    (both idempotent, so a retry completes a confirmation cut short).
 * If the booking can't be confirmed, the authorization is cancelled instead
 * (releaseAuthorization): the guest is never charged without a booking.
 */
export async function confirmBookingPayment(
	deps: ServiceDeps,
	bookingId: string,
	sessionId: string,
	now = new Date(),
): Promise<ConfirmationOutcome> {
	const booking = await loadBooking(deps.db, bookingId);
	if (!booking) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
	}
	// Fast path (return page refreshes): confirmed, captured and recorded.
	if (await isFullyConfirmed(deps.db, booking, sessionId)) {
		return { status: 'already_confirmed', booking };
	}

	const { session, intent, state } = await completedSession(deps, sessionId);
	const mismatch = sessionMismatch(session, booking);
	if (mismatch) {
		console.warn(
			`Checkout Session ${session.id} does not match booking ${booking.confirmationId}`,
		);
		if (state !== 'authorized')
			throw new TRPCError({ code: 'BAD_REQUEST', message: mismatch });
		await releaseAuthorization(deps, session, intent, null, mismatch, now);
		return { status: 'released', booking };
	}

	const { current, claimed } = await claimDates(
		deps,
		booking,
		session,
		intent,
		state,
		now,
	);
	const ours =
		current.status === 'confirmed' && current.stripeSessionId === session.id;
	if (!ours) return settleUnconfirmable(deps, current, session, intent, now);
	return captureAndRecord(deps, current, session, intent, claimed, now);
}

/** The completed session with its PaymentIntent, or BAD_REQUEST if unpaid. */
async function completedSession(deps: ServiceDeps, sessionId: string) {
	const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['payment_intent', 'payment_intent.payment_method'],
	});
	const intent = sessionIntent(session);
	const state = intentState(intent);
	if (session.status !== 'complete' || !intent || state === 'unpaid') {
		throw notPaid();
	}
	return { session, intent, state };
}

/**
 * Step 2: confirms a pending booking with this session in one guarded
 * UPDATE (still pending, dates still free). Returns the booking as it is
 * afterwards and whether this call confirmed it. A captured intent only
 * comes from a session created before manual capture: confirmed as paid.
 */
async function claimDates(
	{ db }: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	state: IntentState,
	now: Date,
): Promise<{ current: Booking; claimed: boolean }> {
	if (booking.status !== 'pending' || state === 'canceled') {
		return { current: booking, claimed: false };
	}
	const [row] = await db
		.update(bookings)
		.set({
			status: 'confirmed',
			paymentStatus: state === 'captured' ? 'paid' : 'authorized',
			confirmedAt: now,
			updatedAt: now,
			stripeSessionId: session.id,
			stripePaymentIntentId: intent.id,
			stripeCustomerId: stripeId(session.customer) ?? booking.stripeCustomerId,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				noOverlapForBookingRow(now),
			),
		)
		.returning();
	if (row) return { current: row, claimed: true };
	return {
		current: (await loadBooking(db, booking.id)) ?? booking,
		claimed: false,
	};
}

/**
 * Steps 3-4 for a booking confirmed with this session: capture (a retry
 * finds it captured already), mark paid, record and email (idempotent).
 */
async function captureAndRecord(
	deps: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	claimed: boolean,
	now: Date,
): Promise<ConfirmationOutcome> {
	if (intent.status === 'canceled') {
		return failAuthorizedBooking(
			deps,
			booking,
			session,
			intent,
			'The card authorization expired or was cancelled before it was captured',
			now,
		);
	}
	if (intent.status === 'requires_capture') {
		const capture = await capturePayment(deps, booking, intent);
		if (capture.status !== 'succeeded') {
			return failAuthorizedBooking(
				deps,
				booking,
				session,
				capture,
				'The card authorization could not be captured',
				now,
			);
		}
	}
	const current = await markPaid(deps.db, booking, now);
	await recordConfirmation(deps, current, session, intent, now);
	return {
		status: claimed ? 'confirmed' : 'already_confirmed',
		booking: current,
	};
}

/** 'authorized' -> 'paid' after the capture (no-op otherwise). */
async function markPaid(db: Database, booking: Booking, now: Date) {
	if (booking.paymentStatus !== 'authorized') return booking;
	const [paid] = await db
		.update(bookings)
		.set({ paymentStatus: 'paid', updatedAt: now })
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.paymentStatus, 'authorized'),
			),
		)
		.returning();
	return paid ?? (await loadBooking(db, booking.id)) ?? booking;
}

/**
 * Captures an authorization. Transient Stripe errors throw (the webhook
 * answers 500 and Stripe retries). A permanent refusal returns the
 * PaymentIntent as it is now, so the caller can tell captured from lost.
 */
async function capturePayment(
	{ stripe }: ServiceDeps,
	booking: Booking,
	intent: Stripe.PaymentIntent,
): Promise<Stripe.PaymentIntent> {
	try {
		return await stripe.paymentIntents.capture(
			intent.id,
			{},
			{ idempotencyKey: `capture/${booking.id}/${intent.id}` },
		);
	} catch (error) {
		if (!isPermanentStripeError(error)) throw error;
		console.error(
			`Capture refused for booking ${booking.confirmationId}:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return stripe.paymentIntents.retrieve(intent.id);
	}
}

/**
 * Cancels an uncaptured PaymentIntent. True when it is cancelled (now or
 * before), false if it was captured. Transient Stripe errors throw.
 */
async function cancelIntent(stripe: Stripe, intentId: string) {
	try {
		await stripe.paymentIntents.cancel(intentId, {
			cancellation_reason: 'abandoned',
		});
		return true;
	} catch (error) {
		if (!isPermanentStripeError(error)) throw error;
		const fresh = await stripe.paymentIntents.retrieve(intentId);
		if (fresh.status === 'canceled') return true;
		if (fresh.status === 'succeeded') return false;
		throw error;
	}
}

/** Booking fields for a payment_released item (all null without one). */
function releasedBookingFields(booking: Booking | null) {
	if (!booking) {
		return {
			confirmationId: null,
			checkInDate: null,
			checkOutDate: null,
			bookingId: null,
			userId: null,
		};
	}
	return {
		confirmationId: booking.confirmationId,
		checkInDate: booking.checkInDate,
		checkOutDate: booking.checkOutDate,
		bookingId: booking.id,
		userId: booking.userId,
	};
}

/** Tells the admins an authorization ended without a charge (inbox). */
async function notifyReleased(
	deps: ServiceDeps,
	session: Stripe.Checkout.Session,
	intentId: string,
	booking: Booking | null,
	reason: string,
	now: Date,
) {
	const { bookingId, userId, ...fields } = releasedBookingFields(booking);
	const roomInfo = booking ? await roomName(deps.db, booking.roomId) : null;
	const amount = (session.amount_total ?? 0) / 100;
	createInboxItemInBackground(
		deps,
		{
			kind: 'payment_released',
			title: `Payment released${fields.confirmationId ? `: ${fields.confirmationId}` : ''}`,
			summary: `A card authorization of ${formatMoney(amount)} ended without a charge. ${reason}.`,
			details: {
				...fields,
				roomName: roomInfo?.name ?? null,
				amount,
				sessionId: session.id,
				paymentIntentId: intentId,
				reason,
				livemode: session.livemode,
			},
			bookingId,
			userId,
			dedupeKey: `payment_released:${intentId}`,
		},
		{ now },
	);
}

/**
 * Cancels an uncaptured authorization so the guest is not charged, and
 * tells the admins. Transient Stripe errors throw (retried by the caller).
 * Returns false if the payment was already captured (nothing to release).
 */
async function releaseAuthorization(
	deps: ServiceDeps,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	booking: Booking | null,
	reason: string,
	now: Date,
): Promise<boolean> {
	if (!(await cancelIntent(deps.stripe, intent.id))) {
		console.error(
			`PaymentIntent ${intent.id} was captured; it can't be released (${reason})`,
		);
		return false;
	}
	console.warn(`PaymentIntent ${intent.id} released, not charged: ${reason}`);
	await notifyReleased(deps, session, intent.id, booking, reason, now);
	return true;
}

/**
 * This session can't confirm the booking: the dates were taken before the
 * claim, the booking was cancelled, or it was confirmed with another
 * session. An authorization is released (and a pending booking whose dates
 * were taken is cancelled, telling the guest they were not charged).
 */
async function settleUnconfirmable(
	deps: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	now: Date,
): Promise<ConfirmationOutcome> {
	const state = intentState(intent);
	const ourSession = booking.stripeSessionId === session.id;
	if (state === 'canceled') {
		// Already released (a replay), or the authorization lapsed: nothing
		// was charged. A pending hold simply expires.
		if (ourSession && booking.status !== 'confirmed') {
			return { status: 'released', booking };
		}
		throw cannotPay();
	}
	if (state === 'captured') {
		// Only a session from before manual capture can be here.
		console.error(
			`Checkout Session ${session.id} was charged but booking ${booking.confirmationId} is ${booking.status}: refund it by hand`,
		);
		throw cannotPay();
	}

	if (booking.status !== 'pending') {
		const reason =
			booking.status === 'confirmed'
				? 'The booking was already paid with another payment'
				: 'The booking was cancelled before the payment completed';
		await releaseAuthorization(deps, session, intent, booking, reason, now);
		return { status: 'released', booking };
	}

	// Still pending: the claim failed because the dates were taken.
	const released = await releaseAuthorization(
		deps,
		session,
		intent,
		booking,
		'The dates were taken before the payment completed',
		now,
	);
	if (!released) throw cannotPay();
	const [cancelled] = await deps.db
		.update(bookings)
		.set({
			status: 'cancelled',
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: 'system',
			cancellationReason: 'dates_unavailable',
			refundAmount: 0,
			stripeSessionId: session.id,
			stripePaymentIntentId: intent.id,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')))
		.returning();
	if (!cancelled) {
		const current = (await loadBooking(deps.db, booking.id)) ?? booking;
		return { status: 'released', booking: current };
	}
	const roomInfo = await roomName(deps.db, booking.roomId);
	inBackground(deps, `dates taken ${booking.confirmationId}`, async () => {
		await sendCancellationEmails(deps.db, deps.env, cancelled, roomInfo, {
			refundAmount: 0,
			cancelledBy: 'system',
			guestMessage:
				'We are sorry: the room was booked on another platform moments before your payment completed, so we could not confirm your stay. Your card was not charged: the authorization hold is released by your bank.',
			adminMessage:
				'A guest paid, but the dates were taken (another booking, an imported reservation or a block) before the payment was confirmed. The card authorization was cancelled: nothing was charged.',
		});
		await sendAdminAlert(deps.db, deps.env, {
			subject: `Payment released: ${booking.confirmationId}`,
			heading: 'Payment released: dates were no longer available',
			paragraphs: [
				'The guest was not charged. Check the calendar for double bookings on other platforms.',
			],
			details: [
				{ label: 'Confirmation', value: booking.confirmationId },
				{ label: 'Room', value: roomInfo.name },
				{
					label: 'Dates',
					value: `${booking.checkInDate} to ${booking.checkOutDate}`,
				},
			],
			link: {
				label: 'Open booking',
				path: `/admin/bookings/${booking.publicId}`,
			},
			idempotencyKey: `released-alert/${booking.id}`,
		});
	});
	return { status: 'released', booking: cancelled };
}

/**
 * The booking was confirmed with this session, but its authorization can't
 * be captured (expired or cancelled). Cancels the booking (frees the dates),
 * releases the authorization if it is still open, tells the guest they were
 * not charged.
 */
async function failAuthorizedBooking(
	deps: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	reason: string,
	now: Date,
): Promise<ConfirmationOutcome> {
	if (intent.status === 'requires_capture') {
		await releaseAuthorization(deps, session, intent, booking, reason, now);
	}
	const [cancelled] = await deps.db
		.update(bookings)
		.set({
			status: 'cancelled',
			paymentStatus: 'pending',
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: 'system',
			cancellationReason: 'payment_failed',
			refundAmount: 0,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'confirmed'),
				eq(bookings.paymentStatus, 'authorized'),
			),
		)
		.returning();
	if (!cancelled) {
		const current = (await loadBooking(deps.db, booking.id)) ?? booking;
		return { status: 'payment_failed', booking: current };
	}
	console.error(`Booking ${booking.confirmationId} cancelled: ${reason}`);
	if (intent.status !== 'requires_capture') {
		// Nothing left to cancel in Stripe; still tell the admins.
		await notifyReleased(deps, session, intent.id, booking, reason, now);
	}
	const roomInfo = await roomName(deps.db, booking.roomId);
	inBackground(deps, `payment failed ${booking.confirmationId}`, () =>
		sendPaymentFailedEmail(deps.db, deps.env, cancelled, roomInfo),
	);
	return { status: 'payment_failed', booking: cancelled };
}

/**
 * Releases the authorization of a completed session whose booking can't be
 * found or confirmed (the webhook's last resort): the guest is never charged
 * without a booking. Does nothing if the session has no open authorization.
 */
export async function releaseSessionAuthorization(
	deps: ServiceDeps,
	sessionId: string,
	reason: string,
	booking: Booking | null = null,
	now = new Date(),
) {
	const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['payment_intent'],
	});
	const intent = sessionIntent(session);
	if (!intent || intent.status !== 'requires_capture') return false;
	return releaseAuthorization(deps, session, intent, booking, reason, now);
}

/** After the capture: the payment row and the emails (both idempotent). */
async function recordConfirmation(
	deps: ServiceDeps,
	confirmed: Booking,
	session: Stripe.Checkout.Session,
	intent: Stripe.PaymentIntent,
	now: Date,
) {
	await deps.db
		.insert(paymentTransactions)
		.values({
			bookingId: confirmed.id,
			stripeCheckoutSessionId: session.id,
			stripePaymentIntentId: intent.id,
			stripeChargeId: stripeId(intent.latest_charge),
			stripeCustomerId: stripeId(session.customer),
			amount: confirmed.totalAmount,
			status: 'paid',
			paymentMethod: paymentMethodType(intent),
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
	const roomInfo = await roomName(deps.db, confirmed.roomId);
	inBackground(deps, `confirmation ${confirmed.confirmationId}`, () =>
		sendBookingConfirmedEmails(deps.db, deps.env, confirmed, roomInfo),
	);
}

/** Saves a refund the app made (source 'app'); webhooks update it later. */
export async function recordAppRefund(
	db: Database,
	refund: Stripe.Refund,
	bookingId: string,
	now = new Date(),
) {
	await db
		.insert(paymentRefunds)
		.values({
			stripeRefundId: refund.id,
			bookingId,
			stripePaymentIntentId: stripeId(refund.payment_intent),
			stripeChargeId: stripeId(refund.charge),
			source: 'app',
			amount: refund.amount / 100,
			currency: refund.currency ?? 'usd',
			status: refund.status ?? 'pending',
			reason: refund.reason ?? null,
			stripeCreatedAt: refund.created ? new Date(refund.created * 1000) : now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
}
