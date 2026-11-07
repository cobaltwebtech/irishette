import { TRPCError } from '@trpc/server';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	paymentTransactions,
	room,
	roomPricingRules,
	user,
} from '@/db/schema-export';

import {
	type Conflict,
	checkAvailability,
	HOLD_MINUTES,
	noOverlapForBookingRow,
} from './availability';
import { quoteCancellation } from './cancellation-policy';
import {
	getActiveCancellationPolicy,
	getBookingCancellationPolicy,
} from './cancellation-policy-store';
import type { IsoDate } from './date-range';
import { inBackground, type ServiceDeps } from './deps';
import {
	sendAdminAlert,
	sendBookingConfirmedEmails,
	sendCancellationEmails,
} from './email-service';
import { syncRoomFeeds } from './ical-sync';
import { newId, newPublicId } from './ids';
import type { CreateBookingInput } from './payment-validation';
import { priceStay, type StayPrice } from './pricing';
import { todayIn } from './timezone';

export type Booking = typeof bookings.$inferSelect;

// Room columns safe to return with a booking: never the iCal export token.
const { icalExportToken: _token, ...roomColumns } = getTableColumns(room);
export const bookingRoomColumns = roomColumns;

const generateConfirmationId = customAlphabet(
	'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',
	6,
);

const toCents = (amount: number) => Math.round(amount * 100);

/** Public conflict shape for guests: dates only, nothing about who booked. */
function publicConflicts(conflicts: Conflict[]) {
	return conflicts.map((c) => ({ checkIn: c.checkIn, checkOut: c.checkOut }));
}

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
	await releaseOwnHolds(deps, userId, input.roomId);

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
 * Deletes the user's pending holds in a room (cancelling any open
 * PaymentIntent). Holds whose payment succeeded or is processing are kept:
 * the webhook or the cleanup cron confirms them.
 */
async function releaseOwnHolds(
	{ db, stripe }: ServiceDeps,
	userId: string,
	roomId: string,
) {
	const holds = await db
		.select({
			id: bookings.id,
			stripePaymentIntentId: bookings.stripePaymentIntentId,
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
		if (hold.stripePaymentIntentId) {
			const intent = await stripe.paymentIntents.retrieve(
				hold.stripePaymentIntentId,
			);
			if (intent.status === 'succeeded' || intent.status === 'processing') {
				continue;
			}
			if (intent.status !== 'canceled') {
				await stripe.paymentIntents.cancel(intent.id);
			}
		}
		await db
			.delete(bookings)
			.where(and(eq(bookings.id, hold.id), eq(bookings.status, 'pending')));
	}
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

// --- PaymentIntent -----------------------------------------------------------

const REUSABLE_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>([
	'requires_payment_method',
	'requires_confirmation',
	'requires_action',
]);

/**
 * Returns a PaymentIntent client secret for a pending booking. Checks the hold
 * is live, syncs the room's import feeds (best effort) and re-checks the dates
 * first. Reuses the booking's existing intent when it can still be paid.
 */
export async function preparePayment(
	deps: ServiceDeps,
	booking: Booking,
	now = new Date(),
): Promise<{ clientSecret: string }> {
	const { db, stripe } = deps;
	if (booking.status !== 'pending') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking is not awaiting payment',
		});
	}
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
	if (booking.stripePaymentIntentId) {
		const existing = await stripe.paymentIntents.retrieve(
			booking.stripePaymentIntentId,
		);
		if (
			REUSABLE_INTENT_STATUSES.has(existing.status) &&
			existing.amount === amount &&
			existing.client_secret
		) {
			return { clientSecret: existing.client_secret };
		}
	}

	const customerId = await ensureStripeCustomer(deps, booking);
	const intent = await stripe.paymentIntents.create({
		amount,
		currency: 'usd',
		customer: customerId,
		metadata: {
			bookingId: booking.id,
			userId: booking.userId,
			roomId: booking.roomId,
			type: 'booking',
		},
		automatic_payment_methods: { enabled: true },
		setup_future_usage: 'off_session',
	});
	await db
		.update(bookings)
		.set({ stripePaymentIntentId: intent.id, updatedAt: now })
		.where(eq(bookings.id, booking.id));
	if (!intent.client_secret) {
		throw new Error('PaymentIntent created without a client secret');
	}
	return { clientSecret: intent.client_secret };
}

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

// --- Confirmation ------------------------------------------------------------

export type ConfirmationOutcome =
	| { status: 'confirmed'; booking: Booking }
	| { status: 'already_confirmed'; booking: Booking }
	| { status: 'refunded_conflict'; booking: Booking };

async function loadBooking(db: Database, id: string) {
	const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
	return row;
}

async function roomName(db: Database, roomId: string) {
	const [row] = await db
		.select({ name: room.name })
		.from(room)
		.where(eq(room.id, roomId));
	return { name: row?.name ?? 'Room' };
}

function verifyIntent(intent: Stripe.PaymentIntent, booking: Booking) {
	if (intent.status !== 'succeeded') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'Payment has not succeeded',
		});
	}
	const mismatch =
		intent.metadata?.bookingId !== booking.id ||
		intent.metadata?.userId !== booking.userId ||
		intent.amount !== toCents(booking.totalAmount) ||
		intent.currency !== 'usd';
	if (mismatch) {
		console.warn(
			`PaymentIntent ${intent.id} does not match booking ${booking.confirmationId}`,
		);
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This payment does not match the booking',
		});
	}
}

/**
 * Confirms a booking after Stripe reports its PaymentIntent succeeded. Used by
 * the front-end confirm and the webhook; idempotent across both.
 *
 * 1. Verifies the intent belongs to this booking (metadata, amount, currency,
 *    user) and succeeded.
 * 2. Confirms with one guarded UPDATE that also checks, atomically, that no
 *    confirmed booking, imported event or block took the dates meanwhile.
 * 3. If the dates were taken: refunds automatically, cancels the booking,
 *    tells the guest and the admins.
 * Emails go out once, from whichever caller changed the booking.
 */
export async function confirmBookingPayment(
	deps: ServiceDeps,
	bookingId: string,
	paymentIntentId: string,
	now = new Date(),
): Promise<ConfirmationOutcome> {
	const { db, stripe } = deps;
	const booking = await loadBooking(db, bookingId);
	if (!booking) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
	}

	if (booking.status === 'confirmed') {
		if (booking.stripePaymentIntentId === paymentIntentId) {
			return { status: 'already_confirmed', booking };
		}
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking was already paid with another payment',
		});
	}
	if (
		booking.status === 'cancelled' &&
		booking.cancellationReason === 'dates_unavailable' &&
		booking.stripePaymentIntentId === paymentIntentId
	) {
		return { status: 'refunded_conflict', booking };
	}
	if (booking.status !== 'pending') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking can no longer be paid',
		});
	}

	const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
	verifyIntent(intent, booking);

	const customerId =
		typeof intent.customer === 'string'
			? intent.customer
			: (intent.customer?.id ?? null);

	const [confirmed] = await db
		.update(bookings)
		.set({
			status: 'confirmed',
			paymentStatus: 'paid',
			confirmedAt: now,
			updatedAt: now,
			stripePaymentIntentId: intent.id,
			stripeCustomerId: customerId ?? booking.stripeCustomerId,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'pending'),
				noOverlapForBookingRow,
			),
		)
		.returning();

	if (confirmed) {
		await db
			.insert(paymentTransactions)
			.values({
				bookingId: booking.id,
				stripePaymentIntentId: intent.id,
				stripeCustomerId: customerId,
				amount: booking.totalAmount,
				status: 'succeeded',
				paymentMethod: intent.payment_method_types?.[0] ?? 'card',
			})
			.onConflictDoNothing();
		const roomInfo = await roomName(db, booking.roomId);
		inBackground(deps, `confirmation ${booking.confirmationId}`, () =>
			sendBookingConfirmedEmails(db, deps.env, confirmed, roomInfo),
		);
		return { status: 'confirmed', booking: confirmed };
	}

	// Nothing changed: another caller confirmed it, or the dates were taken.
	const current = await loadBooking(db, booking.id);
	if (
		current?.status === 'confirmed' &&
		current.stripePaymentIntentId === intent.id
	) {
		return { status: 'already_confirmed', booking: current };
	}
	if (current?.status !== 'pending') {
		if (current?.cancellationReason === 'dates_unavailable') {
			return { status: 'refunded_conflict', booking: current };
		}
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'This booking can no longer be paid',
		});
	}
	return refundUnavailableBooking(deps, current, intent, now);
}

async function refundUnavailableBooking(
	deps: ServiceDeps,
	booking: Booking,
	intent: Stripe.PaymentIntent,
	now: Date,
): Promise<ConfirmationOutcome> {
	const { db, stripe } = deps;
	const refund = await stripe.refunds.create(
		{
			payment_intent: intent.id,
			metadata: { bookingId: booking.id, reason: 'dates_unavailable' },
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
			stripePaymentIntentId: intent.id,
			stripeRefundId: refund.id,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')))
		.returning();
	if (!cancelled) {
		const current = await loadBooking(db, booking.id);
		return { status: 'refunded_conflict', booking: current ?? booking };
	}
	await db
		.insert(paymentTransactions)
		.values({
			bookingId: booking.id,
			stripePaymentIntentId: intent.id,
			amount: booking.totalAmount,
			status: 'refunded',
			paymentMethod: intent.payment_method_types?.[0] ?? 'card',
		})
		.onConflictDoNothing();

	console.warn(
		`Booking ${booking.confirmationId}: dates taken before confirmation, refunded automatically`,
	);
	const roomInfo = await roomName(db, booking.roomId);
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
 * Unpaid holds are cancelled without a refund (their PaymentIntent, if any,
 * is cancelled so it can't be paid later).
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
}

const bookingChanged = () =>
	new TRPCError({
		code: 'CONFLICT',
		message: 'This booking changed. Please reload and try again.',
	});

/** Unpaid hold: cancel its PaymentIntent (if any) so it can't be paid later. */
async function cancelHold(
	{ db, stripe }: ServiceDeps,
	booking: Booking,
	options: CancelOptions,
	now: Date,
) {
	if (booking.stripePaymentIntentId) {
		const intent = await stripe.paymentIntents.retrieve(
			booking.stripePaymentIntentId,
		);
		if (intent.status === 'succeeded' || intent.status === 'processing') {
			throw new TRPCError({
				code: 'CONFLICT',
				message:
					'A payment for this booking is being processed. Please try again in a minute.',
			});
		}
		if (intent.status !== 'canceled') {
			await stripe.paymentIntents.cancel(intent.id);
		}
	}
	const [cancelled] = await db
		.update(bookings)
		.set({
			status: 'cancelled',
			cancelledAt: now,
			updatedAt: now,
			cancelledBy: options.by,
			cancellationReason: options.reason ?? `${options.by}_request`,
			refundAmount: 0,
		})
		.where(and(eq(bookings.id, booking.id), eq(bookings.status, 'pending')))
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
				metadata: { bookingId: booking.id, reason: 'cancellation' },
			},
			{ idempotencyKey: `refund-cancel/${booking.id}` },
		);
		refundId = refund.id;
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
			.set({ status: paymentStatus })
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
