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
	type Conflict,
	checkAvailability,
	HOLD_MINUTES,
	noOverlapForBookingRow,
} from './availability';
import { inBackground, type ServiceDeps } from './deps';
import {
	sendAdminAlert,
	sendBookingConfirmedEmails,
	sendCancellationEmails,
	sendPaymentFailedEmail,
} from './email-service';
import { syncRoomFeeds } from './ical-sync';
import { createInboxItemInBackground } from './inbox-service';
import { roundCents } from './pricing';
import { stripeBookingMetadata, stripeId, toCents } from './stripe';

// Booking payments with Stripe Checkout Sessions (ui_mode 'elements': the
// Payment Element on our own page). One open session per hold, expiring with
// the hold. Fulfilment is driven by the webhook (src/lib/stripe-webhook.ts);
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

const isPaid = (session: Stripe.Checkout.Session) =>
	session.payment_status === 'paid' ||
	session.payment_status === 'no_payment_required';

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
	/** Already paid (or a delayed payment is processing): show the booking. */
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
			await settleCompletedSession(deps, booking, existing, now);
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
				await settleCompletedSession(deps, booking, after, now);
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
			payment_intent_data: {
				metadata,
				description: `Irishette booking ${booking.confirmationId}`,
			},
			// No saved cards (plan 02 decision). Link stays available in the
			// Payment Element when it is enabled in the Dashboard.
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

/** A completed session the app has not acted on yet: confirm or mark processing. */
async function settleCompletedSession(
	deps: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	now: Date,
) {
	if (isPaid(session)) {
		await confirmBookingPayment(deps, booking.id, session.id, now);
	} else {
		await markProcessing(deps, booking, session, now);
	}
}

/**
 * Makes sure a pending hold's Checkout Session can no longer be paid, before
 * the hold is released. Returns 'paid' if the guest paid (or a delayed
 * payment is processing) in the meantime: the hold is then confirmed or kept,
 * and must not be released.
 */
export async function closeHoldSession(
	deps: ServiceDeps,
	hold: Pick<Booking, 'id' | 'stripeSessionId' | 'paymentStatus'>,
	now = new Date(),
): Promise<'closed' | 'paid'> {
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
	const booking = await loadBooking(deps.db, hold.id);
	if (booking?.status === 'pending') {
		await settleCompletedSession(deps, booking, after, now).catch(
			(error: unknown) =>
				console.error(
					`Paid hold ${booking.confirmationId} could not be confirmed:`,
					error instanceof Error ? error.message : 'Unknown error',
				),
		);
	}
	return 'paid';
}

/** checkout.session.completed with payment_status 'unpaid' (delayed method). */
export async function markProcessing(
	{ db }: ServiceDeps,
	booking: Pick<Booking, 'id' | 'confirmationId'>,
	session: Stripe.Checkout.Session,
	now = new Date(),
) {
	await db
		.update(bookings)
		.set({
			paymentStatus: 'processing',
			stripeSessionId: session.id,
			stripePaymentIntentId: stripeId(session.payment_intent),
			updatedAt: now,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				ne(bookings.paymentStatus, 'processing'),
			),
		);
	console.log(
		`Booking ${booking.confirmationId}: payment processing (session ${session.id})`,
	);
}

/**
 * A delayed payment failed (checkout.session.async_payment_failed): release
 * the hold and tell the guest. Idempotent.
 */
export async function releaseFailedPayment(
	deps: ServiceDeps,
	booking: Booking,
	now = new Date(),
) {
	const [released] = await deps.db
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
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')))
		.returning();
	if (!released) return false;
	const roomInfo = await roomName(deps.db, booking.roomId);
	inBackground(deps, `payment failed ${booking.confirmationId}`, () =>
		sendPaymentFailedEmail(deps.env, released, roomInfo),
	);
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

// --- Confirmation ------------------------------------------------------------

export type ConfirmationOutcome =
	| { status: 'confirmed'; booking: Booking }
	| { status: 'already_confirmed'; booking: Booking }
	| { status: 'processing'; booking: Booking }
	| { status: 'refunded_conflict'; booking: Booking };

const notPaid = () =>
	new TRPCError({ code: 'BAD_REQUEST', message: 'Payment has not completed' });

function verifySession(session: Stripe.Checkout.Session, booking: Booking) {
	const mismatch =
		session.metadata?.bookingId !== booking.id ||
		session.client_reference_id !== booking.id ||
		session.amount_total !== toCents(booking.totalAmount) ||
		session.currency !== 'usd' ||
		session.mode !== 'payment';
	if (mismatch) {
		console.warn(
			`Checkout Session ${session.id} does not match booking ${booking.confirmationId}`,
		);
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This payment does not match the booking',
		});
	}
}

/** The PaymentIntent of a session retrieved with `expand: ['payment_intent']`. */
function sessionIntent(session: Stripe.Checkout.Session) {
	const pi = session.payment_intent;
	return pi && typeof pi === 'object' ? pi : null;
}

function paymentMethodType(intent: Stripe.PaymentIntent | null) {
	const pm = intent?.payment_method;
	if (pm && typeof pm === 'object') return pm.type;
	return intent?.payment_method_types?.[0] ?? 'card';
}

/**
 * Confirms a booking after its Checkout Session was paid. Used by the webhook
 * (checkout.session.completed / async_payment_succeeded), the return page
 * (bookings.confirmCheckout) and the hold cleanup; idempotent across all.
 *
 * 1. Retrieves the session (with its PaymentIntent) and verifies it belongs
 *    to this booking (metadata, client_reference_id, amount, currency).
 *    An unpaid completed session (delayed method) marks the hold processing.
 * 2. Confirms with one guarded UPDATE that also checks, atomically, that no
 *    confirmed booking, earlier live hold, imported event or block took the
 *    dates meanwhile.
 * 3. If the dates were taken: refunds automatically, cancels the booking,
 *    tells the guest and the admins.
 * The same-day cutoff is not re-checked: a hold created in time stays
 * payable until it expires (plan 02, B3). Emails go out once, from whichever
 * caller changed the booking.
 */
export async function confirmBookingPayment(
	deps: ServiceDeps,
	bookingId: string,
	sessionId: string,
	now = new Date(),
): Promise<ConfirmationOutcome> {
	const { db, stripe } = deps;
	const booking = await loadBooking(db, bookingId);
	if (!booking) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
	}

	const settled = settledOutcome(booking, sessionId);
	if (settled) return settled;

	const session = await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['payment_intent', 'payment_intent.payment_method'],
	});
	verifySession(session, booking);
	if (session.status !== 'complete') throw notPaid();
	if (!isPaid(session)) {
		await markProcessing(deps, booking, session, now);
		const current = (await loadBooking(db, booking.id)) ?? booking;
		return { status: 'processing', booking: current };
	}

	const intentId = stripeId(session.payment_intent);
	const customerId = stripeId(session.customer);

	const [confirmed] = await db
		.update(bookings)
		.set({
			status: 'confirmed',
			paymentStatus: 'paid',
			confirmedAt: now,
			updatedAt: now,
			stripeSessionId: session.id,
			stripePaymentIntentId: intentId,
			stripeCustomerId: customerId ?? booking.stripeCustomerId,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				noOverlapForBookingRow(now),
			),
		)
		.returning();

	if (confirmed) {
		await recordConfirmation(deps, confirmed, session, now);
		return { status: 'confirmed', booking: confirmed };
	}

	// Nothing changed: another caller confirmed it, or the dates were taken.
	const current = await loadBooking(db, booking.id);
	if (current?.status !== 'pending') {
		const outcome = current && settledOutcome(current, session.id);
		if (outcome) return outcome;
		throw cannotPay();
	}
	if (!intentId) throw notPaid();
	return refundUnavailableBooking(deps, current, session, intentId, now);
}

const cannotPay = () =>
	new TRPCError({
		code: 'BAD_REQUEST',
		message: 'This booking can no longer be paid',
	});

/**
 * The outcome for a booking that is no longer pending: confirmed with this
 * session, or cancelled after the automatic refund for it. Undefined while
 * it is still pending; BAD_REQUEST for any other state.
 */
function settledOutcome(
	booking: Booking,
	sessionId: string,
): ConfirmationOutcome | undefined {
	if (booking.status === 'pending') return undefined;
	const sameSession = booking.stripeSessionId === sessionId;
	if (booking.status === 'confirmed') {
		if (sameSession) return { status: 'already_confirmed', booking };
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking was already paid with another payment',
		});
	}
	if (booking.cancellationReason === 'dates_unavailable' && sameSession) {
		return { status: 'refunded_conflict', booking };
	}
	throw cannotPay();
}

/** After the guarded confirmation: the payment row and the emails. */
async function recordConfirmation(
	deps: ServiceDeps,
	confirmed: Booking,
	session: Stripe.Checkout.Session,
	now: Date,
) {
	const intent = sessionIntent(session);
	await deps.db
		.insert(paymentTransactions)
		.values({
			bookingId: confirmed.id,
			stripeCheckoutSessionId: session.id,
			stripePaymentIntentId: stripeId(session.payment_intent),
			stripeChargeId: stripeId(intent?.latest_charge),
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

async function refundUnavailableBooking(
	deps: ServiceDeps,
	booking: Booking,
	session: Stripe.Checkout.Session,
	intentId: string,
	now: Date,
): Promise<ConfirmationOutcome> {
	const { db, stripe } = deps;
	const refund = await stripe.refunds.create(
		{
			payment_intent: intentId,
			reason: 'requested_by_customer',
			metadata: {
				...stripeBookingMetadata(booking),
				reason: 'dates_unavailable',
			},
		},
		{ idempotencyKey: `refund-unavailable/${booking.id}` },
	);
	const [cancelled] = await db
		.update(bookings)
		.set({
			status: 'cancelled',
			paymentStatus: 'refunded',
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: 'system',
			cancellationReason: 'dates_unavailable',
			refundAmount: booking.totalAmount,
			stripeSessionId: session.id,
			stripePaymentIntentId: intentId,
			stripeRefundId: refund.id,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')))
		.returning();
	if (!cancelled) {
		const current = await loadBooking(db, booking.id);
		return { status: 'refunded_conflict', booking: current ?? booking };
	}
	const intent = sessionIntent(session);
	await db
		.insert(paymentTransactions)
		.values({
			bookingId: booking.id,
			stripeCheckoutSessionId: session.id,
			stripePaymentIntentId: intentId,
			stripeChargeId: stripeId(intent?.latest_charge),
			amount: booking.totalAmount,
			amountRefunded: booking.totalAmount,
			status: 'refunded',
			paymentMethod: paymentMethodType(intent),
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
	await recordAppRefund(db, refund, booking.id, now);

	console.warn(
		`Booking ${booking.confirmationId}: dates taken before confirmation, refunded automatically`,
	);
	const roomInfo = await roomName(db, booking.roomId);
	createInboxItemInBackground(deps, {
		kind: 'refund_auto',
		title: `Automatic refund: ${booking.confirmationId}`,
		summary: `${roomInfo.name}, ${booking.checkInDate} to ${booking.checkOutDate}: the dates were taken before the payment was confirmed, so it was refunded in full.`,
		details: {
			confirmationId: booking.confirmationId,
			roomName: roomInfo.name,
			checkInDate: booking.checkInDate,
			checkOutDate: booking.checkOutDate,
			amount: booking.totalAmount,
			paymentIntentId: intentId,
			refundId: refund.id,
			livemode: session.livemode,
		},
		bookingId: booking.id,
		userId: booking.userId,
		dedupeKey: `refund_auto:${booking.id}`,
	});
	inBackground(deps, `auto-refund ${booking.confirmationId}`, async () => {
		await sendCancellationEmails(db, deps.env, cancelled, roomInfo, {
			refundAmount: booking.totalAmount,
			cancelledBy: 'system',
			guestMessage:
				'We are sorry: the room was booked on another platform moments before your payment completed, so we could not confirm your stay. Your payment has been refunded in full.',
			adminMessage:
				'A guest paid, but the dates were taken (another booking, an imported reservation or a block) before the payment was confirmed. The payment was refunded in full automatically.',
		});
		await sendAdminAlert(db, deps.env, {
			subject: `Automatic refund: ${booking.confirmationId}`,
			heading: 'Payment refunded: dates were no longer available',
			paragraphs: [
				'Check the calendar for double bookings on other platforms.',
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
			idempotencyKey: `auto-refund-alert/${booking.id}`,
		});
	});
	return { status: 'refunded_conflict', booking: cancelled };
}
