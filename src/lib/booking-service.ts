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
import type { IsoDate } from './date-range';
import { inBackground, type ServiceDeps } from './deps';
import { hasOpenDispute } from './dispute-service';
import { sendCancellationEmails } from './email-service';
import { newId, newPublicId } from './ids';
import type { CreateBookingInput } from './payment-validation';
import { priceStay, type StayPrice } from './pricing';
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
	if (input.checkInDate < todayIn(undefined, now)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'Check-in cannot be in the past',
		});
	}

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
	const amountPaid = booking.paymentStatus === 'paid' ? booking.totalAmount : 0;
	const quote = quoteCancellation({
		policy,
		checkInDate: booking.checkInDate,
		amountPaid,
		now,
	});
	return { policy, amountPaid, ...quote };
}

/**
 * Cancels a booking and refunds through Stripe.
 * - Guests: refund per the booking's policy; not after check-in time.
 * - Admins: 'full' (force majeure), 'policy' or 'none'.
 * - With an open payment dispute: guests can't cancel online, and admins
 *   must confirm explicitly to refund (default: no refund).
 * Unpaid holds are cancelled without a refund (their Checkout Session is
 * expired so it can't be paid later).
 */
export async function cancelBooking(
	deps: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now = new Date(),
): Promise<{ refundAmount: number; refundPercent: number }> {
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
) {
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
	const paid = booking.paymentStatus === 'paid' ? booking.totalAmount : 0;
	const amounts: Record<RefundMode, number> = {
		full: paid,
		none: 0,
		policy: quote.refundAmount,
	};
	const refundAmount = amounts[options.refund];
	return {
		paid,
		refundAmount,
		refundPercent: paid > 0 ? Math.round((refundAmount / paid) * 100) : 0,
	};
}

/** Confirmed booking: refund through Stripe, cancel, email guest and admins. */
async function cancelConfirmed(
	deps: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now: Date,
) {
	const { db, stripe } = deps;
	if (await hasOpenDispute(db, booking.id)) {
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
	const { paid, refundAmount, refundPercent } = await refundFor(
		db,
		booking,
		options,
		now,
	);
	let refundId: string | null = null;
	if (refundAmount > 0) {
		if (!booking.stripePaymentIntentId) {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'This booking has no Stripe payment to refund',
			});
		}
		const refund = await stripe.refunds.create(
			{
				payment_intent: booking.stripePaymentIntentId,
				amount: toCents(refundAmount),
				metadata: {
					...stripeBookingMetadata(booking),
					reason: 'cancellation',
				},
			},
			{ idempotencyKey: `refund-cancel/${booking.id}` },
		);
		refundId = refund.id;
		await recordAppRefund(db, refund, booking.id, now);
	}

	const paymentStatus =
		refundAmount <= 0
			? booking.paymentStatus
			: refundAmount >= paid
				? 'refunded'
				: 'partially_refunded';
	const [cancelled] = await db
		.update(bookings)
		.set({
			status: 'cancelled',
			paymentStatus,
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: options.by,
			cancellationReason: options.reason ?? `${options.by}_request`,
			refundAmount,
			stripeRefundId: refundId,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'confirmed')))
		.returning();
	if (!cancelled) throw bookingChanged();
	if (refundAmount > 0) {
		await db
			.update(paymentTransactions)
			.set({ status: paymentStatus, updatedAt: now })
			.where(eq(paymentTransactions.bookingId, booking.id));
	}

	const roomInfo = await roomName(db, booking.roomId);
	inBackground(deps, `cancellation ${booking.confirmationId}`, () =>
		sendCancellationEmails(db, deps.env, cancelled, roomInfo, {
			refundAmount,
			cancelledBy: options.by,
			guestMessage:
				options.by === 'guest'
					? `Your booking ${booking.confirmationId} has been cancelled as you requested.`
					: `We had to cancel your booking ${booking.confirmationId}. We apologize for the inconvenience.`,
			adminMessage:
				options.by === 'guest'
					? `The guest cancelled online. Refund under the cancellation policy: ${refundPercent}%.`
					: `Cancelled by an admin with ${options.refund === 'full' ? 'a full refund' : options.refund === 'none' ? 'no refund' : `the policy refund (${refundPercent}%)`}.`,
		}),
	);
	return { refundAmount, refundPercent };
}
