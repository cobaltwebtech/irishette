import { TRPCError } from '@trpc/server';
import { and, eq, getTableColumns, gt, lt, lte, ne } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import {
	bookingModifications,
	bookings,
	room,
	roomPricingRules,
	user,
} from '@/db/schema-export';
import {
	sendAdminAlert,
	sendCancellationEmails,
} from '@/lib/email/email-service';
import { createInboxItemInBackground } from '@/lib/inbox/inbox-service';
import { inBackground, type ServiceDeps } from '@/lib/server/deps';
import { formatTimeOfDay, SAME_DAY_CUTOFF_TIME } from '@/lib/site';
import { isPermanentStripeError, toCents } from '@/lib/stripe/stripe';
import {
	BOOKING_WINDOW_MONTHS,
	daysBetween,
	type IsoDate,
	lastBookableDate,
	MAX_NIGHTS,
} from '@/utils/date-range';
import { formatMoney } from '@/utils/format';
import { newId, newPublicId } from '@/utils/ids';
import { todayIn } from '@/utils/timezone';

import { checkAvailability, HOLD_MINUTES } from './availability';
import { refundAcrossPayments } from './booking-payments';
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
	roomName,
} from './checkout-service';
import { hasOpenDispute } from './dispute-service';
import type {
	AdminCreateBookingInput,
	CreateBookingInput,
} from './payment-validation';
import { priceStay, roundCents, type StayPrice } from './pricing';
import {
	checkInAt,
	checkOutAt,
	earliestCheckInDate,
	isLateSameDay,
} from './stay-times';
import {
	bookingSplit,
	policyRefundCents,
	refundSplitTaxFirst,
	taxDueOnKept,
} from './tax-split';

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
 * the earliest check-in date (today until 4:00 PM CT, then tomorrow), at most
 * MAX_NIGHTS nights, and check-out within BOOKING_WINDOW_MONTHS. Used when
 * pricing and when holding; a hold created in time stays payable (B3).
 */
export function assertBookableDates(
	checkIn: IsoDate,
	checkOut: IsoDate,
	now = new Date(),
) {
	assertStayWindow(checkIn, checkOut, now);
	if (checkIn < earliestCheckInDate(now)) {
		throw badDates(
			`Same-day bookings close at ${formatTimeOfDay(SAME_DAY_CUTOFF_TIME, { withZone: true })}. The earliest check-in is tomorrow.`,
		);
	}
}

const badDates = (message: string) =>
	new TRPCError({ code: 'BAD_REQUEST', message });

/**
 * The limits every booking has, admin bookings included: check-in not in
 * the past, at most MAX_NIGHTS nights, check-out within
 * BOOKING_WINDOW_MONTHS. No same-day cutoff.
 */
export function assertStayWindow(
	checkIn: IsoDate,
	checkOut: IsoDate,
	now = new Date(),
) {
	const today = todayIn(undefined, now);
	if (checkIn < today) throw badDates('Check-in cannot be in the past');
	if (daysBetween(checkIn, checkOut) > MAX_NIGHTS) {
		throw badDates(`Stays can be at most ${MAX_NIGHTS} nights`);
	}
	if (checkOut > lastBookableDate(today)) {
		throw badDates(
			`Bookings can be made up to ${BOOKING_WINDOW_MONTHS} months ahead`,
		);
	}
}

/** The room takes bookings and this many guests (the room row). */
export async function assertRoomBookable(
	db: Database,
	roomId: string,
	guestCount: number,
) {
	const { room: roomRow } = await loadRoomForPricing(db, roomId);
	if (roomRow.status !== 'active') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This room is not available for booking',
		});
	}
	if (guestCount > roomRow.maxGuests) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `This room allows at most ${roomRow.maxGuests} guest${roomRow.maxGuests === 1 ? '' : 's'}`,
		});
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
	await assertRoomBookable(deps.db, input.roomId, input.guestCount);
	assertBookableDates(input.checkInDate, input.checkOutDate, now);
	// Going back and resubmitting the form replaces the guest's earlier hold.
	await releaseOwnHolds(deps, userId, input.roomId, now);
	return insertHold(deps, input, userId, now);
}

/**
 * An admin's hold for a guest booking by phone (plan 06). Same room, guest
 * and window checks as createHold, but no same-day cutoff: a check-in today
 * after the cutoff is a late same-day booking (non-refundable), which the
 * admin must acknowledge. Records the admin and the guest's verbal consent
 * to keep the card on file. Paid by the admin with a card-only session.
 */
export async function createAdminHold(
	deps: ServiceDeps,
	input: AdminCreateBookingInput,
	{ userId, adminId }: { userId: string; adminId: string },
	now = new Date(),
): Promise<{ bookingId: string; publicId: string; lateSameDay: boolean }> {
	await assertRoomBookable(deps.db, input.roomId, input.guestCount);
	assertStayWindow(input.checkInDate, input.checkOutDate, now);
	const lateSameDay = isLateSameDay(input.checkInDate, now);
	if (lateSameDay && !input.acknowledgeLateBooking) {
		throw badDates(
			`Same-day check-in after ${formatTimeOfDay(SAME_DAY_CUTOFF_TIME, { withZone: true })} is a late booking with no refund. Acknowledge it to continue.`,
		);
	}
	const hold = await insertHold(deps, input, userId, now, {
		createdByAdminId: adminId,
		lateSameDay,
		internalNotes: input.internalNotes || null,
		cardConsentAt: now,
		cardConsentBy: 'admin',
	});
	return { ...hold, lateSameDay };
}

type HoldInput = Pick<
	CreateBookingInput,
	| 'roomId'
	| 'checkInDate'
	| 'checkOutDate'
	| 'guestCount'
	| 'guestName'
	| 'guestEmail'
	| 'guestPhone'
	| 'specialRequests'
	| 'estimatedArrival'
>;

/**
 * Releases expired holds on the dates, checks availability, prices the
 * stay and inserts the pending booking (shared by guest and admin holds).
 */
async function insertHold(
	deps: ServiceDeps,
	input: HoldInput,
	userId: string,
	now: Date,
	extra: Partial<typeof bookings.$inferInsert> = {},
): Promise<{ bookingId: string; publicId: string }> {
	const { db } = deps;
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
		estimatedArrival: input.estimatedArrival,
		baseAmount: price.baseAmount,
		feesAmount: price.feesAmount,
		taxAmount: price.taxAmount,
		taxableAmount: price.taxBreakdown.taxableAmount,
		stateTaxRate: price.taxBreakdown.stateTaxRate,
		cityTaxRate: price.taxBreakdown.cityTaxRate,
		stateTaxAmount: price.taxBreakdown.stateTaxAmount,
		cityTaxAmount: price.taxBreakdown.cityTaxAmount,
		totalAmount: price.totalAmount,
		status: 'pending',
		paymentStatus: 'pending',
		stripeCustomerId: guest?.stripeCustomerId ?? null,
		cancellationPolicyId: policy.id,
		expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
		...extra,
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

/**
 * Before an admin block (plan 05): an expired hold overlapping it may have
 * been paid after all, with no confirmation yet (webhook failing, tab
 * closed). Settles those first, so a paid one is confirmed and the block is
 * then refused instead of taking dates the guest paid for. Unpaid expired
 * holds are left for the cleanup. Block dates are inclusive.
 */
export async function settleExpiredHoldsBeforeBlock(
	deps: ServiceDeps,
	block: { roomId: string; startDate: IsoDate; endDate: IsoDate },
	now = new Date(),
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
				eq(bookings.roomId, block.roomId),
				eq(bookings.status, 'pending'),
				lte(bookings.expiresAt, now),
				ne(bookings.paymentStatus, 'processing'),
				lte(bookings.checkInDate, block.endDate),
				gt(bookings.checkOutDate, block.startDate),
			),
		);
	for (const hold of expired) await closeHoldSession(deps, hold, now);
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
	// A late same-day booking (plan 06) is non-refundable under the policy;
	// an admin's explicit full refund still works (refundFor 'full').
	if (booking.lateSameDay) {
		return {
			policy,
			amountPaid: paid,
			alreadyRefunded,
			...quote,
			refundPercent: 0,
			refundAmount: 0,
			tier: null,
		};
	}
	return {
		policy,
		amountPaid: paid,
		alreadyRefunded,
		...quote,
		refundAmount: policyRefundAmount(
			booking,
			quote,
			paid,
			alreadyRefunded,
			now,
		),
	};
}

/**
 * The policy refund with the hotel tax rule (plan 06, tax-split.ts): the
 * tier's percentage of the room price and fee plus all the tax, unless
 * nothing is refunded within 30 days of check-in (then the full rate is kept
 * and taxed). Bookings without a tax snapshot keep the plain percentage.
 */
function policyRefundAmount(
	booking: Booking,
	quote: { refundPercent: number; refundAmount: number; checkInAt: Date },
	paid: number,
	alreadyRefunded: number,
	now: Date,
) {
	const split = bookingSplit(booking);
	if (!split || paid === 0) return quote.refundAmount;
	const cents = policyRefundCents(
		split,
		quote.refundPercent,
		taxDueOnKept(quote.refundPercent, quote.checkInAt, now),
	);
	const remaining = Math.max(0, roundCents(paid - alreadyRefunded));
	return Math.min(remaining, cents / 100);
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
	if (booking.paymentStatus === 'authorized') {
		// Confirmed, card authorized, capture still under way (plan 05): there
		// is nothing to refund yet. The webhook or the recovery cron finishes
		// the capture within minutes.
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'The payment for this booking is still being completed. Please try again in a few minutes.',
		});
	}
	const [charging] = await db
		.select({ id: bookingModifications.id })
		.from(bookingModifications)
		.where(
			and(
				eq(bookingModifications.bookingId, booking.id),
				eq(bookingModifications.status, 'payment_pending'),
			),
		)
		.limit(1);
	if (charging) {
		// A change's extra charge is not captured yet (plan 06): its payment
		// must exist before the refund can be spread over the payments.
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'A reservation change is still being charged. Please try again in a few minutes.',
		});
	}
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
			// Saved with the cancellation so a retry refunds exactly this.
			pendingRefundAmount: refundAmount > 0 ? refundAmount : null,
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
				// Guests are not told about disputes (decision 2026-11-08).
				'This booking cannot be cancelled online. Please contact us.',
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

type RefundAmounts = {
	paid: number;
	alreadyRefunded: number;
	refundAmount: number;
};

/**
 * Step 2-3 of cancelConfirmed (and the recovery cron's retry): create the
 * Stripe refund, then record it.
 * - Stripe refuses the refund for good: refund_failed + an admin alert.
 * - A transient Stripe error, or a database error after the refund exists:
 *   the booking stays refund_pending and the payment recovery cron retries
 *   (it looks for the existing refund first, so it never refunds twice).
 */
async function refundCancellation(
	deps: ServiceDeps,
	booking: Booking,
	amounts: RefundAmounts,
	now: Date,
	{ retry = false }: { retry?: boolean } = {},
): Promise<{ booking: Booking; refundFailed: boolean }> {
	const { db } = deps;
	const cents = toCents(amounts.refundAmount);
	let refund: Stripe.Refund | undefined;
	let failure: string | null = null;
	try {
		// Spread over the booking's payments (an approved change may have
		// added one, plan 06), newest first.
		const result = await refundAcrossPayments(
			deps,
			booking,
			cents,
			{
				reason: 'cancellation',
				refundKey: `refund-cancel/${booking.id}/${cents}`,
				retry,
				// Tax first, then room and fee (tax-split.ts).
				split: cancellationSplit(booking, cents),
			},
			now,
		);
		refund = result.refunds[0];
		if (result.uncoveredCents > 0 || !refund) {
			failure = `The payments on this booking do not cover the refund (${formatMoney(result.uncoveredCents / 100)} short)`;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (!isPermanentStripeError(error)) {
			console.error(
				`Cancellation refund for booking ${booking.confirmationId} not created yet (retried by the recovery cron): ${message}`,
			);
			return { booking, refundFailed: false };
		}
		failure = message;
	}

	if (failure || !refund) {
		return failCancellationRefund(
			deps,
			booking,
			amounts.refundAmount,
			failure ?? 'No refund was created',
			now,
		);
	}
	return recordCancellationRefund(db, booking, amounts, refund, now);
}

/** The room / fee / tax of a cancellation refund (null: no snapshot). */
function cancellationSplit(booking: Booking, cents: number) {
	const split = bookingSplit(booking);
	return split ? refundSplitTaxFirst(split, cents) : null;
}

/** Stripe refused the refund for good: refund_failed and an admin alert. */
async function failCancellationRefund(
	deps: ServiceDeps,
	booking: Booking,
	amount: number,
	message: string,
	now: Date,
): Promise<{ booking: Booking; refundFailed: boolean }> {
	console.error(
		`Cancellation refund failed for booking ${booking.confirmationId}: ${message}`,
	);
	const [updated] = await deps.db
		.update(bookings)
		.set({
			paymentStatus: 'refund_failed',
			pendingRefundAmount: null,
			updatedAt: now,
		})
		.where(eq(bookings.id, booking.id))
		.returning();
	alertCancellationRefundFailed(deps, booking, amount, message);
	return { booking: updated ?? booking, refundFailed: true };
}

/**
 * The refund exists (refundAcrossPayments recorded it and the payment
 * totals): record it on the booking. A database error must not report a
 * failed refund (the recovery cron finds the refund and retries).
 */
async function recordCancellationRefund(
	db: Database,
	booking: Booking,
	amounts: RefundAmounts,
	refund: Stripe.Refund,
	now: Date,
): Promise<{ booking: Booking; refundFailed: boolean }> {
	try {
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
				pendingRefundAmount: null,
				stripeRefundId: refund.id,
				updatedAt: now,
			})
			.where(
				and(
					eq(bookings.id, booking.id),
					eq(bookings.paymentStatus, 'refund_pending'),
				),
			)
			.returning();
		return { booking: updated ?? booking, refundFailed: false };
	} catch (error) {
		console.error(
			`Refund ${refund.id} created for booking ${booking.confirmationId}, but recording it failed (retried by the recovery cron):`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return { booking, refundFailed: false };
	}
}

/**
 * Payment recovery (cron): a cancelled booking still refund_pending, e.g.
 * the Worker stopped between the cancellation and the refund. Retries the
 * refund with the amount saved at cancellation. Returns true when the
 * refund now exists or failed for good (nothing left to retry).
 */
export async function retryCancellationRefund(
	deps: ServiceDeps,
	bookingId: string,
	now = new Date(),
) {
	const [booking] = await deps.db
		.select()
		.from(bookings)
		.where(eq(bookings.id, bookingId));
	if (
		booking?.status !== 'cancelled' ||
		booking.paymentStatus !== 'refund_pending' ||
		!booking.pendingRefundAmount
	) {
		return false;
	}
	const outcome = await refundCancellation(
		deps,
		booking,
		{
			paid: booking.totalAmount,
			alreadyRefunded: booking.refundAmount ?? 0,
			refundAmount: booking.pendingRefundAmount,
		},
		now,
		{ retry: true },
	);
	return outcome.booking.paymentStatus !== 'refund_pending';
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
				category: 'payment_problem',
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
