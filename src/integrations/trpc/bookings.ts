import { TRPCError } from '@trpc/server';
import { and, between, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { bookings, paymentTransactions, room, user } from '@/db/schema-export';
import {
	type Booking,
	bookingRoomColumns,
	cancelBooking,
	confirmBookingPayment,
	createHold,
	preparePayment,
	quoteBookingCancellation,
	quoteStay,
	refreshHold,
} from '@/lib/booking-service';
import { sendBookingConfirmationEmail } from '@/lib/email-service';
import {
	adminCancelBookingSchema,
	bookingIdSchema,
	bookingPublicIdSchema,
	calculateBookingSchema,
	cancelBookingSchema,
	confirmPaymentSchema,
	createBookingSchema,
} from '@/lib/payment-validation';

import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
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
	if (!(allowAdmin && ctx.user.role === 'admin')) {
		conditions.push(eq(bookings.userId, ctx.user.id));
	}
	const [row] = await ctx.db
		.select()
		.from(bookings)
		.where(and(...conditions));
	if (!row) throw notFound();
	return row;
}

async function bookingDetails(ctx: AuthedContext, booking: Booking) {
	const [[roomRow], [payment]] = await Promise.all([
		ctx.db
			.select(bookingRoomColumns)
			.from(room)
			.where(eq(room.id, booking.roomId)),
		ctx.db
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, booking.id))
			.limit(1),
	]);
	return { booking, room: roomRow, paymentDetails: payment ?? null };
}

const listStatusSchema = z
	.enum(['pending', 'confirmed', 'cancelled', 'completed'])
	.optional();

export const bookingsRouter = createTRPCRouter({
	/** Price of a stay (read-only). Same calculation as booking creation. */
	calculateBooking: publicProcedure
		.input(calculateBookingSchema)
		.query(async ({ ctx, input }) => {
			const price = await quoteStay(
				ctx.db,
				input.roomId,
				input.checkInDate,
				input.checkOutDate,
			);
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
		}),

	/** Holds the dates for 30 minutes as a pending booking. */
	createBooking: protectedProcedure
		.input(createBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const { bookingId, publicId } = await createHold(ctx, input, ctx.user.id);
			return { bookingId, publicId, success: true };
		}),

	/** PaymentIntent for the in-app checkout (Payment Element). */
	createPaymentIntent: protectedProcedure
		.input(bookingIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, { id: input.bookingId });
			const { clientSecret } = await preparePayment(ctx, booking);
			return {
				clientSecret,
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
	 * Confirms after Stripe.js reports success. The webhook does the same as a
	 * backup; both are idempotent. If the dates were taken meanwhile, the
	 * payment is refunded and this throws CONFLICT.
	 */
	confirmPayment: protectedProcedure
		.input(confirmPaymentSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, { id: input.bookingId });
			const outcome = await confirmBookingPayment(
				ctx,
				booking.id,
				input.paymentIntentId,
			);
			if (outcome.status === 'refunded_conflict') {
				throw new TRPCError({
					code: 'CONFLICT',
					message:
						'Sorry, these dates were booked elsewhere moments before your payment completed. Your payment has been refunded in full.',
				});
			}
			return { success: true, publicId: booking.publicId };
		}),

	/** Booking with room and payment. Owner or admin (admins also get the guest). */
	getBooking: protectedProcedure
		.input(bookingPublicIdSchema)
		.query(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, input, {
				allowAdmin: true,
			});
			const details = await bookingDetails(ctx, booking);
			if (ctx.user.role !== 'admin') return { ...details, user: null };
			const [guest] = await ctx.db
				.select({
					id: user.id,
					publicId: user.publicId,
					email: user.email,
					name: user.name,
				})
				.from(user)
				.where(eq(user.id, booking.userId));
			return { ...details, user: guest ?? null };
		}),

	getMyBookings: protectedProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
				status: listStatusSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions = [eq(bookings.userId, ctx.user.id)];
			if (input.status) conditions.push(eq(bookings.status, input.status));
			return ctx.db
				.select({
					booking: bookings,
					room: {
						id: room.id,
						name: room.name,
						slug: room.slug,
						basePrice: room.basePrice,
					},
				})
				.from(bookings)
				.innerJoin(room, eq(bookings.roomId, room.id))
				.where(and(...conditions))
				.orderBy(desc(bookings.createdAt))
				.limit(input.limit)
				.offset(input.offset);
		}),

	/** What cancelling now would refund (owner or admin). */
	getCancellationQuote: protectedProcedure
		.input(bookingPublicIdSchema)
		.query(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(ctx, input, {
				allowAdmin: true,
			});
			const quote = await quoteBookingCancellation(ctx.db, booking);
			return {
				status: booking.status,
				paymentStatus: booking.paymentStatus,
				canCancel:
					booking.status !== 'cancelled' &&
					(booking.status === 'pending' || quote.canCancel),
				amountPaid: quote.amountPaid,
				refundAmount: booking.status === 'pending' ? 0 : quote.refundAmount,
				refundPercent: booking.status === 'pending' ? 0 : quote.refundPercent,
				checkInAt: quote.checkInAt,
				hoursBeforeCheckIn: quote.hoursBeforeCheckIn,
				policy: {
					name: quote.policy.name,
					checkInTime: quote.policy.checkInTime,
					timezone: quote.policy.timezone,
					tiers: quote.policy.tiers,
				},
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
			});
			return { success: true, ...result };
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
			});
			return { success: true, ...result };
		}),

	/** Re-sends the guest confirmation email (owner or admin). */
	resendConfirmationEmail: protectedProcedure
		.input(bookingIdSchema)
		.mutation(async ({ ctx, input }) => {
			const booking = await findAccessibleBooking(
				ctx,
				{ id: input.bookingId },
				{ allowAdmin: true },
			);
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
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to send the confirmation email',
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
				paymentStatus: z
					.enum(['pending', 'paid', 'partially_refunded', 'refunded', 'failed'])
					.optional(),
				roomId: z.string().optional(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions: SQL[] = [];
			if (input.status) conditions.push(eq(bookings.status, input.status));
			if (input.paymentStatus) {
				conditions.push(eq(bookings.paymentStatus, input.paymentStatus));
			}
			if (input.roomId) conditions.push(eq(bookings.roomId, input.roomId));
			if (input.startDate && input.endDate) {
				conditions.push(
					between(bookings.checkInDate, input.startDate, input.endDate),
				);
			}
			return ctx.db
				.select({
					booking: bookings,
					room: { id: room.id, slug: room.slug, basePrice: room.basePrice },
					user: { id: user.id, email: user.email, name: user.name },
				})
				.from(bookings)
				.innerJoin(room, eq(bookings.roomId, room.id))
				.innerJoin(user, eq(bookings.userId, user.id))
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(desc(bookings.createdAt))
				.limit(input.limit)
				.offset(input.offset);
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
