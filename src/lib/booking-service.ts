import { TRPCError } from '@trpc/server';
import { and, eq, getTableColumns, gt, lt, lte, ne } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	paymentTransactions,
	room,
	roomPricingRules,
	user,
} from '@/db/schema-export';

import { checkAvailability, HOLD_MINUTES } from './availability';
import { PAID_STATUSES } from './booking-status';
import { quoteCancellation } from './cancellation-policy';
import {
	getActiveCancellationPolicy,
	getBookingCancellationPolicy,
} from './cancellation-policy-store';
import {
	type Booking,
	closeHoldSession,
	publicConflicts,
	recordAppRefund,
	roomName,
} from './checkout-service';
import {
	BOOKING_WINDOW_MONTHS,
	daysBetween,
	type IsoDate,
	lastBookableDate,
	MAX_NIGHTS,
} from './date-range';
import { inBackground, type ServiceDeps } from './deps';
import { hasOpenDispute } from './dispute-service';
import { sendAdminAlert, sendCancellationEmails } from './email-service';
import { formatMoney } from './format';
import { newId, newPublicId } from './ids';
import { createInboxItemInBackground } from './inbox-service';
import type { CreateBookingInput } from './payment-validation';
import { priceStay, roundCents, type StayPrice } from './pricing';
import { formatTimeOfDay, SAME_DAY_CUTOFF_TIME } from './site';
import { checkInAt, checkOutAt, earliestCheckInDate } from './stay-times';
import { stripeBookingMetadata, toCents } from './stripe';
import { todayIn } from './timezone';

export type { Booking } from './checkout-service';

// Room columns safe to return with a booking: never the iCal export token.
const { icalExportToken: _token, ...roomColumns } = getTableColumns(room);
export const bookingRoomColumns = roomColumns;

const generateConfirmationId = customAlphabet(
	'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',
	6,
);

// --- Pricing ---------------------------------------------------------------

async function loadRoomForPricing(db: Database, roomId: string) {
	const [roomRow] = await db
		.select(roomColumns)
		.from(room)
		.where(eq(room.id, roomId));
	if (!roomRow) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
	}
	const rules = await db
		.select()
		.from(roomPricingRules)
		.where(
			and(
				eq(roomPricingRules.roomId, roomId),
				eq(roomPricingRules.isActive, true),
			),
		);
	return { room: roomRow, rules };
}

/** The price of a stay (calendar and checkout use this). */
export async function quoteStay(
	db: Database,
	roomId: string,
	checkIn: IsoDate,
	checkOut: IsoDate,
): Promise<StayPrice & { roomBasePrice: number }> {
	if (checkOut <= checkIn) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'Check-out must be after check-in',
		});
	}
	const { room: roomRow, rules } = await loadRoomForPricing(db, roomId);
	return {
		...priceStay(roomRow, rules, checkIn, checkOut),
		roomBasePrice: roomRow.basePrice,
	};
}

// --- Holds -----------------------------------------------------------------

/**
 * Dates a new booking may have (plan 02, 3.8 / 3.9): check-in not before
 * the earliest check-in date (today until 9:00 AM CT, then tomorrow), at most
 * MAX_NIGHTS nights, and check-out within BOOKING_WINDOW_MONTHS. Used when
 * pricing and when holding; a hold created in time stays payable (B3).
 */
export function assertBookableDates(
	checkIn: IsoDate,
	checkOut: IsoDate,
	now = new Date(),
) {
	const today = todayIn(undefined, now);
	const earliest = earliestCheckInDate(now);
	const fail = (message: string) =>
		new TRPCError({ code: 'BAD_REQUEST', message });
	if (checkIn < today) throw fail('Check-in cannot be in the past');
	if (checkIn < earliest) {
		throw fail(
			`Same-day bookings close at ${formatTimeOfDay(SAME_DAY_CUTOFF_TIME, { withZone: true })}. The earliest check-in is tomorrow.`,
		);
	}
	if (daysBetween(checkIn, checkOut) > MAX_NIGHTS) {
		throw fail(`Stays can be at most ${MAX_NIGHTS} nights`);
	}
	if (checkOut > lastBookableDate(today)) {
		throw fail(
			`Bookings can be made up to ${BOOKING_WINDOW_MONTHS} months ahead`,
		);
	}
}

/**
 * Creates a pending booking that holds the dates for HOLD_MINUTES. Prices are
 * computed here; prices sent by the client are ignored.
 */
export async function createHold(
	deps: ServiceDeps,
	input: CreateBookingInput,
	userId: string,
	now = new Date(),
): Promise<{ bookingId: string; publicId: string }> {
	const { db } = deps;
	const { room: roomRow } = await loadRoomForPricing(db, input.roomId);
	if (roomRow.status !== 'active') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This room is not available for booking',
		});
	}
	if (input.guestCount > roomRow.maxGuests) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `This room allows at most ${roomRow.maxGuests} guest${roomRow.maxGuests === 1 ? '' : 's'}`,
		});
	}
	assertBookableDates(input.checkInDate, input.checkOutDate, now);

	// Going back and resubmitting the form replaces the guest's earlier hold.
	await releaseOwnHolds(deps, userId, input.roomId, now);
	// First hold wins while it is live; expired holds on these dates are
	// released, and their Checkout Sessions expired so nobody can pay them.
	await releaseExpiredHolds(deps, input, now);

	const availability = await checkAvailability(
		db,
		input.roomId,
		input.checkInDate,
		input.checkOutDate,
		{ now },
	);
	if (!availability.available) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: 'These dates are no longer available',
			cause: { conflicts: publicConflicts(availability.conflicts) },
		});
	}

	const price = await quoteStay(
		db,
		input.roomId,
		input.checkInDate,
		input.checkOutDate,
	);
	const policy = await getActiveCancellationPolicy(db);
	const [guest] = await db
		.select({ stripeCustomerId: user.stripeCustomerId })
		.from(user)
		.where(eq(user.id, userId));

	const id = newId();
	const publicId = newPublicId();
	await db.insert(bookings).values({
		id,
		publicId,
		userId,
		roomId: input.roomId,
		confirmationId: generateConfirmationId(),
		checkInDate: input.checkInDate,
		checkOutDate: input.checkOutDate,
		checkInAt: checkInAt(input.checkInDate),
		checkOutAt: checkOutAt(input.checkOutDate),
		numberOfNights: price.numberOfNights,
		numberOfGuests: input.guestCount,
		guestName: input.guestName,
		guestEmail: input.guestEmail,
		guestPhone: input.guestPhone,
		specialRequests: input.specialRequests,
		baseAmount: price.baseAmount,
		feesAmount: price.feesAmount,
		taxAmount: price.taxAmount,
		totalAmount: price.totalAmount,
		status: 'pending',
		paymentStatus: 'pending',
		stripeCustomerId: guest?.stripeCustomerId ?? null,
		cancellationPolicyId: policy.id,
		expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
	});
	return { bookingId: id, publicId };
}

/**
 * Deletes the user's pending holds in a room, expiring their Checkout
 * Sessions. Holds that were paid or are processing are kept: the webhook (or
 * closeHoldSession itself) confirms them.
 */
async function releaseOwnHolds(
	deps: ServiceDeps,
	userId: string,
	roomId: string,
	now: Date,
) {
	const holds = await deps.db
		.select({
			id: bookings.id,
			stripeSessionId: bookings.stripeSessionId,
			paymentStatus: bookings.paymentStatus,
		})
		.from(bookings)
		.where(
			and(
				eq(bookings.userId, userId),
				eq(bookings.roomId, roomId),
				eq(bookings.status, 'pending'),
			),
		);
	for (const hold of holds) {
		if ((await closeHoldSession(deps, hold, now)) === 'paid') continue;
		await deleteHold(deps.db, hold.id);
	}
}

/** Deletes a pending hold unless a delayed payment started processing. */
async function deleteHold(db: Database, id: string) {
	await db
		.delete(bookings)
		.where(
			and(
				eq(bookings.id, id),
				eq(bookings.status, 'pending'),
				ne(bookings.paymentStatus, 'processing'),
			),
		);
}

/**
 * Releases other guests' expired holds that overlap [checkIn, checkOut),
 * expiring their Checkout Sessions first. If one turns out to be paid, it
 * is confirmed (or kept as processing) and the new hold is refused.
 */
async function releaseExpiredHolds(
	deps: ServiceDeps,
	stay: { roomId: string; checkInDate: IsoDate; checkOutDate: IsoDate },
	now: Date,
) {
	const expired = await deps.db
		.select({
			id: bookings.id,
			stripeSessionId: bookings.stripeSessionId,
			paymentStatus: bookings.paymentStatus,
		})
		.from(bookings)
		.where(
			and(
				eq(bookings.roomId, stay.roomId),
				eq(bookings.status, 'pending'),
				lte(bookings.expiresAt, now),
				ne(bookings.paymentStatus, 'processing'),
				lt(bookings.checkInDate, stay.checkOutDate),
				gt(bookings.checkOutDate, stay.checkInDate),
			),
		);
	for (const hold of expired) {
		if ((await closeHoldSession(deps, hold, now)) === 'closed') {
			await deleteHold(deps.db, hold.id);
		}
	}
}

/** Releases an expired hold (cron cleanup). False if it was paid meanwhile. */
export async function releaseExpiredHold(
	deps: ServiceDeps,
	hold: Pick<Booking, 'id' | 'stripeSessionId' | 'paymentStatus'>,
	now = new Date(),
): Promise<boolean> {
	if ((await closeHoldSession(deps, hold, now)) === 'paid') return false;
	await deleteHold(deps.db, hold.id);
	return true;
}

/** Extends an expired hold if the dates are still free. */
export async function refreshHold(
	deps: ServiceDeps,
	booking: Booking,
	now = new Date(),
): Promise<{ bookingId: string; refreshed: boolean; expiresAt: Date }> {
	if (booking.status !== 'pending') {
		return {
			bookingId: booking.id,
			refreshed: false,
			expiresAt: booking.expiresAt ?? now,
		};
	}
	if (booking.expiresAt && booking.expiresAt > now) {
		return {
			bookingId: booking.id,
			refreshed: false,
			expiresAt: booking.expiresAt,
		};
	}
	const availability = await checkAvailability(
		deps.db,
		booking.roomId,
		booking.checkInDate,
		booking.checkOutDate,
		{ excludeBookingId: booking.id, now },
	);
	if (!availability.available) {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'The room is no longer available for these dates. Please start a new booking.',
		});
	}
	const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
	await deps.db
		.update(bookings)
		.set({ expiresAt, updatedAt: now })
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')));
	return { bookingId: booking.id, refreshed: true, expiresAt };
}

// --- Cancellation --------------------------------------------------------------

type RefundMode = 'policy' | 'full' | 'none';

/**
 * What the guest paid (the booking total, the base for policy percentages),
 * what was already refunded (e.g. a partial refund in Stripe), and what can
 * still be refunded.
 */
function paidAmounts(booking: Booking) {
	const paid = PAID_STATUSES.includes(booking.paymentStatus)
		? booking.totalAmount
		: 0;
	const alreadyRefunded = paid > 0 ? (booking.refundAmount ?? 0) : 0;
	return {
		paid,
		alreadyRefunded,
		remaining: Math.max(0, roundCents(paid - alreadyRefunded)),
	};
}

/** What cancelling now would refund, under the booking's policy. */
export async function quoteBookingCancellation(
	db: Database,
	booking: Booking,
	now = new Date(),
) {
	const policy = await getBookingCancellationPolicy(
		db,
		booking.cancellationPolicyId,
	);
	const { paid, alreadyRefunded } = paidAmounts(booking);
	const quote = quoteCancellation({
		policy,
		checkInDate: booking.checkInDate,
		checkInAt: booking.checkInAt,
		amountPaid: paid,
		alreadyRefunded,
		now,
	});
	return { policy, amountPaid: paid, alreadyRefunded, ...quote };
}

export interface CancelResult {
	refundAmount: number;
	refundPercent: number;
	/** The refund could not be created; admins were alerted. */
	refundFailed?: boolean;
}

/**
 * Cancels a booking and refunds through Stripe.
 * - Guests: refund per the booking's policy; not after check-in time.
 * - Admins: 'full' (force majeure), 'policy' or 'none'.
 * - With an open payment dispute: guests can't cancel online, and admins
 *   must confirm explicitly to refund (default: no refund).
 * - `expectedRefundAmount` (the amount the dialog showed): if the refund
 *   changed meanwhile (a window passed), CONFLICT with the new quote.
 * Unpaid holds are cancelled without a refund (their Checkout Session is
 * expired so it can't be paid later).
 */
export async function cancelBooking(
	deps: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now = new Date(),
): Promise<CancelResult> {
	if (booking.status === 'cancelled') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking is already cancelled',
		});
	}
	return booking.status === 'pending'
		? cancelHold(deps, booking, options, now)
		: cancelConfirmed(deps, booking, options, now);
}

interface CancelOptions {
	by: 'guest' | 'admin';
	refund: RefundMode;
	reason?: string;
	/**
	 * Admins only: refund although the payment has an open dispute (Stripe
	 * warns this can credit the guest twice). Plan 02, B7.
	 */
	confirmDisputeRefund?: boolean;
	/** The refund the guest or admin was shown (quote drift check). */
	expectedRefundAmount?: number;
}

const bookingChanged = () =>
	new TRPCError({
		code: 'CONFLICT',
		message: 'This booking changed. Please reload and try again.',
	});

/** Unpaid hold: expire its Checkout Session so it can't be paid later. */
async function cancelHold(
	deps: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now: Date,
): Promise<CancelResult> {
	if ((await closeHoldSession(deps, booking, now)) === 'paid') {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'A payment for this booking is being processed. Please try again in a minute.',
		});
	}
	const [cancelled] = await deps.db
		.update(bookings)
		.set({
			status: 'cancelled',
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: options.by,
			cancellationReason: options.reason ?? `${options.by}_request`,
			refundAmount: 0,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				ne(bookings.paymentStatus, 'processing'),
			),
		)
		.returning();
	if (!cancelled) throw bookingChanged();
	return { refundAmount: 0, refundPercent: 0 };
}

/** Amount to refund for a confirmed booking, by who cancels and how. */
async function refundFor(
	db: Database,
	booking: Booking,
	options: CancelOptions,
	now: Date,
) {
	const quote = await quoteBookingCancellation(db, booking, now);
	if (options.by === 'guest' && !quote.canCancel) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message:
				'Check-in time has passed; this booking can no longer be cancelled online.',
		});
	}
	const { paid, alreadyRefunded, remaining } = paidAmounts(booking);
	const amounts: Record<RefundMode, number> = {
		full: remaining,
		none: 0,
		policy: quote.refundAmount,
	};
	const refundAmount = amounts[options.refund];
	const refundPercent =
		options.refund === 'policy'
			? quote.refundPercent
			: paid > 0
				? Math.round((refundAmount / paid) * 100)
				: 0;
	if (
		options.expectedRefundAmount !== undefined &&
		roundCents(options.expectedRefundAmount) !== refundAmount
	) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: `The refund is now ${formatMoney(refundAmount)} (${refundPercent}%) because a cancellation window just passed. Please review and confirm again.`,
			cause: { refundAmount, refundPercent },
		});
	}
	return {
		paid,
		alreadyRefunded,
		refundAmount,
		refundPercent,
		cutoffAt: options.refund === 'policy' ? (quote.tier?.until ?? null) : null,
	};
}

/**
 * Confirmed booking (plan 02, 3.7): save the cancellation first, then
 * refund, then record the result.
 * 1. Guarded update to cancelled (paymentStatus refund_pending if a refund
 *    is due), with the applied tier.
 * 2. Create the refund (metadata source 'irishette'; idempotency key with
 *    the amount).
 * 3. refunded / partially_refunded, or refund_failed + an admin alert (the
 *    booking stays cancelled).
 */
async function cancelConfirmed(
	deps: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now: Date,
): Promise<CancelResult> {
	const { db } = deps;
	await assertDisputeAllows(db, booking, options);
	const amounts = await refundFor(db, booking, options, now);
	const { refundAmount, refundPercent } = amounts;
	if (refundAmount > 0 && !booking.stripePaymentIntentId) {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'This booking has no Stripe payment to refund',
		});
	}

	const [cancelled] = await db
		.update(bookings)
		.set({
			status: 'cancelled',
			paymentStatus:
				refundAmount > 0 ? 'refund_pending' : booking.paymentStatus,
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: options.by,
			cancellationReason: options.reason ?? `${options.by}_request`,
			cancellationRefundPercent: refundPercent,
			cancellationCutoffAt: amounts.cutoffAt,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'confirmed')))
		.returning();
	if (!cancelled) throw bookingChanged();

	const outcome =
		refundAmount > 0
			? await refundCancellation(deps, cancelled, amounts, now)
			: { booking: cancelled, refundFailed: false };

	const roomInfo = await roomName(db, booking.roomId);
	inBackground(deps, `cancellation ${booking.confirmationId}`, () =>
		sendCancellationEmails(db, deps.env, outcome.booking, roomInfo, {
			refundAmount,
			cancelledBy: options.by,
			guestMessage:
				options.by === 'guest'
					? `Your booking ${booking.confirmationId} has been cancelled as you requested.`
					: `We had to cancel your booking ${booking.confirmationId}. We apologize for the inconvenience.`,
			adminMessage: `${
				options.by === 'guest'
					? `The guest cancelled online. Refund under the cancellation policy: ${refundPercent}%.`
					: `Cancelled by an admin with ${options.refund === 'full' ? 'a full refund' : options.refund === 'none' ? 'no refund' : `the policy refund (${refundPercent}%)`}.`
			}${outcome.refundFailed ? ' The refund FAILED: see the admin alert and refund it in Stripe.' : ''}`,
		}),
	);
	return { refundAmount, refundPercent, refundFailed: outcome.refundFailed };
}

/** Guests can't cancel during a dispute; admins must confirm a refund. */
async function assertDisputeAllows(
	db: Database,
	booking: Booking,
	options: CancelOptions,
) {
	if (!(await hasOpenDispute(db, booking.id))) return;
	if (options.by === 'guest') {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'This booking has an open payment dispute, so it cannot be cancelled online. Please contact us.',
		});
	}
	if (options.refund !== 'none' && !options.confirmDisputeRefund) {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'This payment has an open dispute. Refunding it now can credit the guest twice; confirm the refund explicitly or cancel without a refund.',
		});
	}
}

/** Step 2-3 of cancelConfirmed: the Stripe refund and its result. */
async function refundCancellation(
	deps: ServiceDeps,
	booking: Booking,
	amounts: { paid: number; alreadyRefunded: number; refundAmount: number },
	now: Date,
): Promise<{ booking: Booking; refundFailed: boolean }> {
	const { db, stripe } = deps;
	const cents = toCents(amounts.refundAmount);
	try {
		const refund = await stripe.refunds.create(
			{
				payment_intent: booking.stripePaymentIntentId ?? '',
				amount: cents,
				reason: 'requested_by_customer',
				metadata: {
					...stripeBookingMetadata(booking),
					reason: 'cancellation',
				},
			},
			{ idempotencyKey: `refund-cancel/${booking.id}/${cents}` },
		);
		await recordAppRefund(db, refund, booking.id, now);
		const totalRefunded = roundCents(
			amounts.alreadyRefunded + amounts.refundAmount,
		);
		const paymentStatus =
			totalRefunded >= amounts.paid ? 'refunded' : 'partially_refunded';
		const [updated] = await db
			.update(bookings)
			.set({
				paymentStatus,
				refundAmount: totalRefunded,
				stripeRefundId: refund.id,
				updatedAt: now,
			})
			.where(eq(bookings.id, booking.id))
			.returning();
		await db
			.update(paymentTransactions)
			.set({
				status: paymentStatus,
				amountRefunded: totalRefunded,
				updatedAt: now,
			})
			.where(eq(paymentTransactions.bookingId, booking.id));
		return { booking: updated ?? booking, refundFailed: false };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error(
			`Cancellation refund failed for booking ${booking.confirmationId}: ${message}`,
		);
		const [updated] = await db
			.update(bookings)
			.set({ paymentStatus: 'refund_failed', updatedAt: now })
			.where(eq(bookings.id, booking.id))
			.returning();
		alertCancellationRefundFailed(deps, booking, amounts.refundAmount, message);
		return { booking: updated ?? booking, refundFailed: true };
	}
}

function alertCancellationRefundFailed(
	deps: ServiceDeps,
	booking: Booking,
	amount: number,
	failure: string,
) {
	createInboxItemInBackground(deps, {
		kind: 'refund_failed',
		title: `Refund failed: ${booking.confirmationId}`,
		summary: `The booking was cancelled, but the refund of ${formatMoney(amount)} could not be created in Stripe. Refund it in the Stripe Dashboard.`,
		details: {
			refundId: 'not created',
			amount,
			currency: 'usd',
			paymentIntentId: booking.stripePaymentIntentId,
			confirmationId: booking.confirmationId,
			failureReason: failure,
			livemode: false,
		},
		bookingId: booking.id,
		userId: booking.userId,
		dedupeKey: `refund_failed:cancel:${booking.id}`,
	});
	inBackground(
		deps,
		`cancellation refund failed ${booking.confirmationId}`,
		() =>
			sendAdminAlert(deps.db, deps.env, {
				subject: `Refund failed: ${booking.confirmationId}`,
				heading: 'A cancellation refund failed',
				paragraphs: [
					'The booking was cancelled, but Stripe did not create the refund. Refund the guest in the Stripe Dashboard.',
				],
				details: [
					{ label: 'Confirmation', value: booking.confirmationId },
					{ label: 'Amount', value: formatMoney(amount) },
					{ label: 'Error', value: failure },
				],
				link: {
					label: 'Open booking',
					path: `/admin/bookings/${booking.publicId}`,
				},
				idempotencyKey: `refund-failed/cancel/${booking.id}`,
			}),
	);
}
