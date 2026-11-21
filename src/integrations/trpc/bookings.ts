import { TRPCError } from '@trpc/server';
import {
	and,
	asc,
	between,
	desc,
	eq,
	gt,
	gte,
	lte,
	type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import {
	bookingModifications,
	bookings,
	paymentRefunds,
	paymentTransactions,
	room,
	user,
} from '@/db/schema-export';
import {
	findGuestByEmail,
	findOrCreateGuest,
} from '@/lib/booking/admin-booking-service';
import {
	assertBookableDates,
	assertStayWindow,
	type Booking,
	bookingRoomColumns,
	cancelBooking,
	createAdminHold,
	createHold,
	quoteBookingCancellation,
	quoteStay,
	refreshHold,
} from '@/lib/booking/booking-service';
import {
	bookingStatusSchema,
	paymentStatusSchema,
} from '@/lib/booking/booking-status';
import { getBookingCancellationPolicy } from '@/lib/booking/cancellation-policy-store';
import {
	confirmBookingPayment,
	prepareCheckout,
} from '@/lib/booking/checkout-service';
import {
	hasOpenDispute,
	listDisputes,
	openDisputeExists,
} from '@/lib/booking/dispute-service';
import {
	confirmModificationCheckout,
	createModificationCheckout,
	type ModificationTarget,
	modifyBooking,
	planModification,
	releaseRoomEarly,
	savedCard,
} from '@/lib/booking/modification-service';
import {
	adminConfirmModificationSchema,
	adminModifyBookingSchema,
	adminReleaseEarlySchema,
	modificationTargetSchema,
} from '@/lib/booking/modification-validation';
import {
	adminCancelBookingSchema,
	adminCreateBookingSchema,
	bookingIdSchema,
	bookingPublicIdSchema,
	calculateBookingSchema,
	cancelBookingSchema,
	confirmCheckoutSchema,
	createBookingSchema,
} from '@/lib/booking/payment-validation';
import { roundCents } from '@/lib/booking/pricing';
import { isLateSameDay, stayPhase } from '@/lib/booking/stay-times';
import { sendBookingConfirmationEmail } from '@/lib/email/email-service';
import { isoDateSchema } from '@/utils/date-range';
import { idSchema } from '@/utils/ids';

import { isActiveAdmin } from './access';
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
	rateLimit,
} from './init';
import type { TRPCContext } from './inner-context';

type AuthedContext = TRPCContext & {
	user: NonNullable<TRPCContext['user']>;
};

const notFound = () =>
	new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

/**
 * A booking the caller may act on: their own, or any booking for an admin
 * when `allowAdmin` is set. Anything else is NOT_FOUND (no existence leak).
 */
async function findAccessibleBooking(
	ctx: AuthedContext,
	where: { id: string } | { publicId: string },
	{ allowAdmin = false } = {},
): Promise<Booking> {
	const conditions: SQL[] = [
		'id' in where
			? eq(bookings.id, where.id)
			: eq(bookings.publicId, where.publicId),
	];
	// Admin access re-checks D1 (the session role may be stale); the query only
	// runs for sessions that claim the admin role.
	const actAsAdmin =
		allowAdmin &&
		ctx.user.role === 'admin' &&
		(await isActiveAdmin(ctx.db, ctx.user.id));
	if (!actAsAdmin) {
		conditions.push(eq(bookings.userId, ctx.user.id));
	}
	const [row] = await ctx.db
		.select()
		.from(bookings)
		.where(and(...conditions));
	if (!row) throw notFound();
	return row;
}

/**
 * The booking fields a guest sees for their own booking: no internal ids,
 * admin notes or Stripe ids (admins use `adminGetBooking`).
 */
const GUEST_BOOKING_FIELDS = [
	'publicId',
	'confirmationId',
	'status',
	'paymentStatus',
	'checkInDate',
	'checkOutDate',
	'numberOfNights',
	'numberOfGuests',
	'baseAmount',
	'feesAmount',
	'taxAmount',
	'totalAmount',
	'refundAmount',
	'checkInAt',
	'checkOutAt',
	'guestName',
	'guestEmail',
	'guestPhone',
	'specialRequests',
	'estimatedArrival',
	'createdAt',
	'cancelledAt',
] as const satisfies readonly (keyof Booking)[];

type GuestBookingField = (typeof GUEST_BOOKING_FIELDS)[number];

const guestBookingColumns = Object.fromEntries(
	GUEST_BOOKING_FIELDS.map((field) => [field, bookings[field]]),
) as { [K in GuestBookingField]: (typeof bookings)[K] };

/**
 * Derived timing for a guest booking (plan 02, 3.6): the stay phase in
 * property time, whether it can still be cancelled online, and until when
 * (check-in at 4:00 PM CT). `blocked` (an open payment dispute) also turns
 * `canCancel` off; guests are never told why (decision 2026-11-08: no
 * dispute information on guest pages).
 */
function withTiming<
	B extends Pick<Booking, 'status' | 'checkInAt' | 'checkOutAt'>,
>(booking: B, now = new Date(), blocked = false) {
	return {
		...booking,
		stayPhase: stayPhase(booking, now),
		canCancel:
			booking.status !== 'cancelled' && now < booking.checkInAt && !blocked,
		cancelUntil: booking.checkInAt,
	};
}

function toGuestBooking(booking: Booking, blocked = false) {
	return withTiming(
		Object.fromEntries(
			GUEST_BOOKING_FIELDS.map((field) => [field, booking[field]]),
		) as Pick<Booking, GuestBookingField>,
		new Date(),
		blocked,
	);
}

/** An open dispute blocks online cancellation (confirmed bookings only). */
const disputeBlocks = (db: TRPCContext['db'], booking: Booking) =>
	booking.status === 'confirmed'
		? hasOpenDispute(db, booking.id)
		: Promise.resolve(false);

/** SQL filter for a stay phase (uses the stored check-in/out instants). */
function phaseCondition(phase: 'upcoming' | 'current' | 'past', now: Date) {
	if (phase === 'upcoming') return gt(bookings.checkInAt, now);
	if (phase === 'current') return gt(bookings.checkOutAt, now);
	return lte(bookings.checkOutAt, now);
}

/** `current` = upcoming or in stay (check-out not passed yet). */
const phaseFilterSchema = z.enum(['upcoming', 'current', 'past']).optional();

/** Room fields shown with a guest's booking. */
const guestRoomColumns = { name: room.name, slug: room.slug };

const listStatusSchema = bookingStatusSchema.optional();

/** A booking for an admin action, by public id (NOT_FOUND otherwise). */
async function adminBooking(ctx: AuthedContext, publicId: string) {
	return findAccessibleBooking(ctx, { publicId }, { allowAdmin: true });
}

const targetOf = (input: {
	roomId: string;
	checkInDate: string;
	checkOutDate: string;
}): ModificationTarget => ({
	roomId: input.roomId,
	checkInDate: input.checkInDate,
	checkOutDate: input.checkOutDate,
});

/** The price breakdown returned by calculateBooking and adminQuote. */
function priceDetails(price: Awaited<ReturnType<typeof quoteStay>>) {
	return {
		baseAmount: price.baseAmount,
		feesAmount: price.feesAmount,
		taxAmount: price.taxAmount,
		totalAmount: price.totalAmount,
		numberOfNights: price.numberOfNights,
		nights: price.nights.map((n) => ({ date: n.date, price: n.price })),
		appliedRules: price.appliedRules.map((r) => ({
			id: r.id,
			name: r.name,
			ruleType: r.ruleType,
			value: r.value,
			nights: r.nights,
			appliedAmount: r.appliedAmount,
		})),
		taxBreakdown: price.taxBreakdown,
	};
}

export const bookingsRouter = createTRPCRouter({
	/** Price of a stay (read-only). Same calculation as booking creation. */
	calculateBooking: publicProcedure
		.use(rateLimit('API_RATE_LIMITER', 'bookings.calculateBooking'))
		.input(calculateBookingSchema)
		.query(async ({ ctx, input }) => {
			assertBookableDates(input.checkInDate, input.checkOutDate);
			const price = await quoteStay(
				ctx.db,
				input.roomId,
				input.checkInDate,
				input.checkOutDate,
			);
			return priceDetails(price);
		}),

	/**
	 * Admin price of a stay (plan 06): the same quote with the admin window
	 * (no same-day cutoff), and whether it would be a late same-day booking.
	 */
	adminQuote: adminProcedure
		.input(calculateBookingSchema)
		.query(async ({ ctx, input }) => {
			const now = new Date();
			assertStayWindow(input.checkInDate, input.checkOutDate, now);
			const price = await quoteStay(
				ctx.db,
				input.roomId,
				input.checkInDate,
				input.checkOutDate,
			);
			return {
				...priceDetails(price),
				lateSameDay: isLateSameDay(input.checkInDate, now),
			};
		}),

	/** The guest account with this email, for the admin booking form. */
	adminFindGuest: adminProcedure
		.input(z.object({ email: z.email().max(254) }))
		.query(async ({ ctx, input }) => {
			const guest = await findGuestByEmail(ctx.db, input.email);
			if (!guest) return null;
			return {
				publicId: guest.publicId,
				name: guest.name,
				email: guest.email,
				phoneNumber: guest.phoneNumber,
				banned: Boolean(guest.banned),
			};
		}),

	/**
	 * An admin booking by phone (plan 06): finds or creates the guest's
	 * account, then holds the dates (no same-day cutoff; a late same-day
	 * booking must be acknowledged). The admin then pays it with
	 * adminCreateCheckoutSession (card only); confirmation is the usual
	 * claim, capture and emails.
	 */
	adminCreateBooking: adminProcedure
		.input(adminCreateBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const { userId, created } = await findOrCreateGuest(ctx.db, {
				email: input.guestEmail,
				name: input.guestName,
				phone: input.guestPhone,
			});
			const hold = await createAdminHold(ctx, input, {
				userId,
				adminId: ctx.user.id,
			});
			return { ...hold, guestCreated: created };
		}),

	/** Holds the dates for HOLD_MINUTES (35) as a pending booking. */
	createBooking: protectedProcedure
		.input(createBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const { bookingId, publicId } = await createHold(ctx, input, ctx.user.id);
			return { bookingId, publicId, success: true };
		}),

	/**
	 * The hold's Checkout Session (Payment Element on our page). Returns its
	 * client secret, or status 'complete' when it was already paid.
	 */
	createCheckoutSession: protectedProcedure
		.input(bookingIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, { id: input.bookingId });
			const result = await prepareCheckout(ctx, booking);
			return {
				...result,
				publicId: booking.publicId,
				publishableKey: ctx.env.STRIPE_PUBLISHABLE_KEY,
			};
		}),

	/**
	 * Admin variant of createCheckoutSession (plan 06): any booking. An
	 * admin-created hold gets a card-only session (the card the guest reads
	 * out by phone) that returns to the admin booking page.
	 */
	adminCreateCheckoutSession: adminProcedure
		.input(bookingIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(
				ctx,
				{ id: input.bookingId },
				{ allowAdmin: true },
			);
			const result = await prepareCheckout(ctx, booking);
			return {
				...result,
				publicId: booking.publicId,
				publishableKey: ctx.env.STRIPE_PUBLISHABLE_KEY,
			};
		}),

	/** Extends an expired hold if the dates are still free. */
	refreshBooking: protectedProcedure
		.input(bookingIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, { id: input.bookingId });
			return refreshHold(ctx, booking);
		}),

	/**
	 * Fast path after checkout.confirm() or the return page
	 * (?session_id=...): the same idempotent confirmation the webhook runs.
	 * Returns 'confirmed' / 'already_confirmed', 'released' (the booking
	 * could not be confirmed, e.g. the dates were taken meanwhile; the card
	 * authorization was cancelled, nothing charged) or 'payment_failed' (the
	 * authorization could not be captured; nothing charged).
	 */
	confirmCheckout: protectedProcedure
		.input(confirmCheckoutSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, {
				publicId: input.publicId,
			});
			const outcome = await confirmBookingPayment(
				ctx,
				booking.id,
				input.sessionId,
			);
			return { status: outcome.status, publicId: booking.publicId };
		}),

	/** Admin variant of confirmCheckout (plan 06): any booking. */
	adminConfirmCheckout: adminProcedure
		.input(confirmCheckoutSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(
				ctx,
				{ publicId: input.publicId },
				{ allowAdmin: true },
			);
			const outcome = await confirmBookingPayment(
				ctx,
				booking.id,
				input.sessionId,
			);
			return { status: outcome.status, publicId: booking.publicId };
		}),

	/** The caller's own booking (guest fields) with its room. */
	getBooking: protectedProcedure
		.input(bookingPublicIdSchema)
		.query(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, input);
			const [roomRow] = await ctx.db
				.select(guestRoomColumns)
				.from(room)
				.where(eq(room.id, booking.roomId));
			const policy = await getBookingCancellationPolicy(
				ctx.db,
				booking.cancellationPolicyId,
			);
			return {
				booking: toGuestBooking(booking, await disputeBlocks(ctx.db, booking)),
				room: roomRow,
				cancellationPolicy: { name: policy.name, tiers: policy.tiers },
			};
		}),

	/** Any booking with every column, its room and the guest account (admin). */
	adminGetBooking: adminProcedure
		.input(bookingPublicIdSchema)
		.query(async ({ ctx, input }) => {
			const [booking] = await ctx.db
				.select()
				.from(bookings)
				.where(eq(bookings.publicId, input.publicId));
			if (!booking) throw notFound();
			const [[roomRow], [guest]] = await Promise.all([
				ctx.db
					.select(bookingRoomColumns)
					.from(room)
					.where(eq(room.id, booking.roomId)),
				ctx.db
					.select({
						publicId: user.publicId,
						email: user.email,
						name: user.name,
					})
					.from(user)
					.where(eq(user.id, booking.userId)),
			]);
			const [disputes, payments, refunds, modifications] = await Promise.all([
				listDisputes(ctx.db, { bookingId: booking.id }),
				ctx.db
					.select({
						id: paymentTransactions.id,
						stripePaymentIntentId: paymentTransactions.stripePaymentIntentId,
						amount: paymentTransactions.amount,
						amountRefunded: paymentTransactions.amountRefunded,
						status: paymentTransactions.status,
						paymentMethod: paymentTransactions.paymentMethod,
						cardBrand: paymentTransactions.cardBrand,
						cardLast4: paymentTransactions.cardLast4,
						createdAt: paymentTransactions.createdAt,
					})
					.from(paymentTransactions)
					.where(eq(paymentTransactions.bookingId, booking.id))
					.orderBy(asc(paymentTransactions.createdAt)),
				ctx.db
					.select({
						id: paymentRefunds.id,
						stripeRefundId: paymentRefunds.stripeRefundId,
						stripePaymentIntentId: paymentRefunds.stripePaymentIntentId,
						source: paymentRefunds.source,
						amount: paymentRefunds.amount,
						status: paymentRefunds.status,
						createdAt: paymentRefunds.createdAt,
					})
					.from(paymentRefunds)
					.where(eq(paymentRefunds.bookingId, booking.id))
					.orderBy(asc(paymentRefunds.createdAt)),
				ctx.db
					.select()
					.from(bookingModifications)
					.where(eq(bookingModifications.bookingId, booking.id))
					.orderBy(asc(bookingModifications.createdAt)),
			]);
			return {
				booking,
				room: roomRow,
				user: guest ?? null,
				disputes,
				paymentTransactions: payments,
				paymentRefunds: refunds,
				bookingModifications: modifications,
			};
		}),

	getMyBookings: protectedProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
				status: listStatusSchema,
				phase: phaseFilterSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			const now = new Date();
			const conditions = [eq(bookings.userId, ctx.user.id)];
			if (input.status) conditions.push(eq(bookings.status, input.status));
			if (input.phase) conditions.push(phaseCondition(input.phase, now));
			const rows = await ctx.db
				.select({
					booking: guestBookingColumns,
					room: guestRoomColumns,
					disputed: openDisputeExists,
				})
				.from(bookings)
				.innerJoin(room, eq(bookings.roomId, room.id))
				.where(and(...conditions))
				.orderBy(
					input.phase === 'past'
						? desc(bookings.checkInAt)
						: asc(bookings.checkInAt),
				)
				.limit(input.limit)
				.offset(input.offset);
			return rows.map(({ disputed, ...r }) => ({
				...r,
				booking: withTiming(r.booking, now, Boolean(disputed)),
			}));
		}),

	/** What cancelling now would refund (owner or admin). */
	getCancellationQuote: protectedProcedure
		.input(bookingPublicIdSchema)
		.query(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, input, {
				allowAdmin: true,
			});
			const quote = await quoteBookingCancellation(ctx.db, booking);
			const pending = booking.status === 'pending';
			// Admins see an open dispute (refund only with explicit
			// confirmation, B7). Guests only see that online cancellation is
			// closed, never why (decision 2026-11-08).
			const disputed = await disputeBlocks(ctx.db, booking);
			const asAdmin =
				ctx.user.role === 'admin' && (await isActiveAdmin(ctx.db, ctx.user.id));
			const timeAllows =
				booking.status !== 'cancelled' &&
				(booking.status === 'pending' || quote.canCancel);
			return {
				status: booking.status,
				hasOpenDispute: asAdmin && disputed,
				paymentStatus: booking.paymentStatus,
				canCancel: timeAllows && (asAdmin || !disputed),
				/** Why guests can't cancel online now (null: they can). */
				cancelBlocked: !timeAllows
					? ('check_in_passed' as const)
					: !asAdmin && disputed
						? ('contact_us' as const)
						: null,
				amountPaid: quote.amountPaid,
				alreadyRefunded: quote.alreadyRefunded,
				/** What a full refund would return now (after partial refunds). */
				refundableAmount: Math.max(
					0,
					roundCents(quote.amountPaid - quote.alreadyRefunded),
				),
				refundAmount: pending ? 0 : quote.refundAmount,
				refundPercent: pending ? 0 : quote.refundPercent,
				checkInDate: booking.checkInDate,
				checkInAt: quote.checkInAt,
				/** Each tier's cutoff as a UTC instant (most notice first). */
				refundCutoffs: quote.refundCutoffs.map((c) => ({
					refundPercent: c.refundPercent,
					minHoursBefore: c.minHoursBefore,
					until: c.until,
				})),
				policy: { name: quote.policy.name, tiers: quote.policy.tiers },
			};
		}),

	/** Guest cancellation; refunds per the booking's cancellation policy. */
	cancelBooking: protectedProcedure
		.input(cancelBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, {
				publicId: input.publicId,
			});
			const result = await cancelBooking(ctx, booking, {
				by: 'guest',
				refund: 'policy',
				reason: input.reason ? `guest_request: ${input.reason}` : undefined,
				expectedRefundAmount: input.expectedRefundAmount,
			});
			return { success: true, ...result };
		}),

	/**
	 * What a move, extension or room change would cost (plan 06): the full
	 * reprice at current rates, the signed difference from the booking
	 * total, and the card on file it would be charged to. Read-only.
	 */
	adminQuoteModification: adminProcedure
		.input(modificationTargetSchema)
		.query(async ({ ctx, input }) => {
			const booking = await adminBooking(ctx, input.publicId);
			const plan = await planModification(ctx, booking, targetOf(input));
			const card =
				plan.differenceCents > 0 ? await savedCard(ctx, booking) : null;
			return {
				kind: plan.kind,
				current: {
					baseAmount: booking.baseAmount,
					feesAmount: booking.feesAmount ?? 0,
					taxAmount: booking.taxAmount ?? 0,
					totalAmount: booking.totalAmount,
					numberOfNights: booking.numberOfNights,
				},
				next: priceDetails(plan.price),
				/** The booking total after the change (kept money included). */
				newTotal: plan.amounts.totalAmount,
				/** New stay price minus the current total (cents). */
				priceDifferenceCents: plan.priceDifferenceCents,
				/** What moves: positive charged, negative refunded (cents). */
				differenceCents: plan.differenceCents,
				/** Cancellation tier applied to dropped nights (null: none). */
				refundPercent: plan.refundPercent,
				savedCard: card ? { brand: card.brand, last4: card.last4 } : null,
				hasOpenDispute: await hasOpenDispute(ctx.db, booking.id),
			};
		}),

	/**
	 * Applies a move, extension or room change (plan 06). A higher price is
	 * charged to the saved card off-session; when it can't be, returns
	 * 'card_required' with nothing changed (then use
	 * adminCreateModificationCheckout). A lower price is refunded.
	 */
	adminModifyBooking: adminProcedure
		.input(adminModifyBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await adminBooking(ctx, input.publicId);
			return modifyBooking(
				ctx,
				booking,
				{
					target: targetOf(input),
					expectedDifferenceCents: input.expectedDifferenceCents,
					note: input.note,
					confirmDisputeRefund: input.confirmDisputeRefund,
				},
				ctx.user.id,
			);
		}),

	/**
	 * A card-only Checkout Session for a change's extra charge, when the saved
	 * card can't be charged: the admin types the card the guest reads out.
	 */
	adminCreateModificationCheckout: adminProcedure
		.input(adminModifyBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await adminBooking(ctx, input.publicId);
			const result = await createModificationCheckout(
				ctx,
				booking,
				{
					target: targetOf(input),
					expectedDifferenceCents: input.expectedDifferenceCents,
					note: input.note,
				},
				ctx.user.id,
			);
			return { ...result, publishableKey: ctx.env.STRIPE_PUBLISHABLE_KEY };
		}),

	/** Applies the change paid with that session (idempotent with the webhook). */
	adminConfirmModificationCheckout: adminProcedure
		.input(adminConfirmModificationSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await adminBooking(ctx, input.publicId);
			const session = await ctx.stripe.checkout.sessions.retrieve(
				input.sessionId,
			);
			if (session.metadata?.bookingId !== booking.id) throw notFound();
			return confirmModificationCheckout(ctx, input.sessionId, {
				note: input.note,
			});
		}),

	/** The guest left early: the stay ends earlier, no refund (plan 06). */
	adminReleaseRoomEarly: adminProcedure
		.input(adminReleaseEarlySchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await adminBooking(ctx, input.publicId);
			return releaseRoomEarly(
				ctx,
				booking,
				{ newCheckOutDate: input.newCheckOutDate, note: input.note },
				ctx.user.id,
			);
		}),

	/** Admin cancellation: full refund (force majeure), policy refund or none. */
	adminCancelBooking: adminProcedure
		.input(adminCancelBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(
				ctx,
				{ publicId: input.publicId },
				{ allowAdmin: true },
			);
			const result = await cancelBooking(ctx, booking, {
				by: 'admin',
				refund: input.refund,
				reason: input.reason ? `admin: ${input.reason}` : undefined,
				confirmDisputeRefund: input.confirmDisputeRefund,
				expectedRefundAmount: input.expectedRefundAmount,
			});
			return { success: true, ...result };
		}),

	/** Re-sends the guest confirmation email (owner or admin). */
	resendConfirmationEmail: protectedProcedure
		.input(bookingPublicIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, input, {
				allowAdmin: true,
			});
			if (booking.status !== 'confirmed') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Only confirmed bookings have a confirmation email',
				});
			}
			const [roomRow] = await ctx.db
				.select({ name: room.name })
				.from(room)
				.where(eq(room.id, booking.roomId));
			const result = await sendBookingConfirmationEmail(ctx.env, booking, {
				name: roomRow?.name ?? 'Room',
			});
			if (!result.success) {
				// The email provider failed (email-service logs why). Not an
				// INTERNAL_SERVER_ERROR: that would hide this message.
				throw new TRPCError({
					code: 'BAD_GATEWAY',
					message:
						'The confirmation email could not be sent. Please try again.',
				});
			}
			return { success: true, message: 'Confirmation email sent successfully' };
		}),

	adminListBookings: adminProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
				status: listStatusSchema,
				paymentStatus: paymentStatusSchema.optional(),
				phase: phaseFilterSchema,
				roomId: idSchema.optional(),
				/** Check-in on or after this date. */
				startDate: isoDateSchema.optional(),
				/** Check-in on or before this date. */
				endDate: isoDateSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions: SQL[] = [];
			if (input.status) conditions.push(eq(bookings.status, input.status));
			if (input.paymentStatus) {
				conditions.push(eq(bookings.paymentStatus, input.paymentStatus));
			}
			if (input.roomId) conditions.push(eq(bookings.roomId, input.roomId));
			const now = new Date();
			if (input.phase) conditions.push(phaseCondition(input.phase, now));
			if (input.startDate) {
				conditions.push(gte(bookings.checkInDate, input.startDate));
			}
			if (input.endDate) {
				conditions.push(lte(bookings.checkInDate, input.endDate));
			}
			const rows = await ctx.db
				.select({
					booking: bookings,
					room: { id: room.id, slug: room.slug, basePrice: room.basePrice },
					user: { id: user.id, email: user.email, name: user.name },
					hasOpenDispute: openDisputeExists,
				})
				.from(bookings)
				.innerJoin(room, eq(bookings.roomId, room.id))
				.innerJoin(user, eq(bookings.userId, user.id))
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(
					input.phase === 'current'
						? asc(bookings.checkInAt)
						: input.phase === 'past'
							? desc(bookings.checkInAt)
							: desc(bookings.createdAt),
				)
				.limit(input.limit)
				.offset(input.offset);
			return rows.map((r) => ({
				...r,
				stayPhase: stayPhase(r.booking, now),
			}));
		}),

	adminUpdateInternalNotes: adminProcedure
		.input(
			z.object({
				bookingId: z.string().min(1),
				internalNotes: z.string().max(5000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(bookings)
				.set({ internalNotes: input.internalNotes, updatedAt: new Date() })
				.where(eq(bookings.id, input.bookingId))
				.returning({ id: bookings.id });
			if (!updated) throw notFound();
			return { success: true, message: 'Internal notes updated successfully' };
		}),

	/** Booking counts and revenue per check-in month (admin dashboard). */
	adminGetMonthlyStats: adminProcedure
		.input(
			z.object({
				months: z.number().min(1).max(24).default(12),
				status: z.enum(['confirmed', 'all']).default('confirmed'),
			}),
		)
		.query(async ({ ctx, input }) => {
			const start = new Date();
			start.setMonth(start.getMonth() - input.months);
			const startDate = start.toISOString().slice(0, 10);
			const endDate = new Date().toISOString().slice(0, 10);

			const conditions: SQL[] = [
				between(bookings.checkInDate, startDate, endDate),
			];
			if (input.status === 'confirmed') {
				conditions.push(eq(bookings.status, 'confirmed'));
			}
			const rows = await ctx.db
				.select({
					checkInDate: bookings.checkInDate,
					totalAmount: bookings.totalAmount,
					baseAmount: bookings.baseAmount,
				})
				.from(bookings)
				.where(and(...conditions));

			const byMonth = new Map<
				string,
				{ bookings: number; revenue: number; baseRevenue: number }
			>();
			for (const row of rows) {
				const month = row.checkInDate.slice(0, 7);
				const entry = byMonth.get(month) ?? {
					bookings: 0,
					revenue: 0,
					baseRevenue: 0,
				};
				entry.bookings += 1;
				entry.revenue += row.totalAmount;
				entry.baseRevenue += row.baseAmount;
				byMonth.set(month, entry);
			}
			return [...byMonth.entries()]
				.map(([month, data]) => ({ month, ...data }))
				.sort((a, b) => a.month.localeCompare(b.month));
		}),
});
