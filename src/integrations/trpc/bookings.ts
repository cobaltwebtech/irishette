import { TRPCError } from '@trpc/server';
import { and, between, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDrizzle } from '@/db/drizzle-init';
import { bookings, room, user } from '@/db/schema-export';
import {
	type BookingEmailData,
	sendBookingConfirmationEmail,
} from '@/lib/email-service';
import { PaymentService } from '@/lib/payment-service';
import {
	calculateBookingSchema,
	cancelBookingSchema,
	createBookingSchema,
	createCheckoutSessionSchema,
	updateBookingSchema,
} from '@/lib/payment-validation';
import { createTRPCRouter, publicProcedure } from './init';

export const bookingsRouter = createTRPCRouter({
	/**
	 * Check room availability for booking dates
	 */
	checkAvailability: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
				checkInDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
				checkOutDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
			}),
		)
		.query(async ({ ctx, input }) => {
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				const availability = await paymentService.checkRoomAvailability(
					input.roomId,
					input.checkInDate,
					input.checkOutDate,
				);

				return {
					roomId: input.roomId,
					checkInDate: input.checkInDate,
					checkOutDate: input.checkOutDate,
					...availability,
				};
			} catch (error) {
				console.error('Failed to check room availability:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error
							? error.message
							: 'Failed to check availability',
				});
			}
		}),

	/**
	 * Calculate booking pricing
	 */
	calculateBooking: publicProcedure
		.input(calculateBookingSchema)
		.mutation(async ({ ctx, input }) => {
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				const pricing = await paymentService.calculateBookingPrice(
					input.roomId,
					input.checkInDate,
					input.checkOutDate,
					input.guestCount,
				);

				return pricing;
			} catch (error) {
				console.error('Failed to calculate booking price:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error
							? error.message
							: 'Failed to calculate booking price',
				});
			}
		}),

	/**
	 * Create a new booking (requires user session)
	 */
	createBooking: publicProcedure
		.input(
			createBookingSchema.extend({
				userId: z.string(), // Temporarily require userId in input until we have proper auth context
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				const { userId, ...bookingData } = input;

				// Create temporary booking
				const bookingId = await paymentService.createTemporaryBooking(
					bookingData,
					userId,
				);

				return { bookingId, success: true };
			} catch (error) {
				console.error('Failed to create booking:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error ? error.message : 'Failed to create booking',
				});
			}
		}),

	/**
	 * Create Stripe checkout session for existing booking
	 */
	createCheckoutSession: publicProcedure
		.input(
			createCheckoutSessionSchema.extend({
				userId: z.string(), // Temporarily require userId until we have proper auth context
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				const { userId, ...checkoutData } = input;

				// Verify booking belongs to user
				const bookingResult = await db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.id, checkoutData.bookingId),
							eq(bookings.userId, userId),
						),
					);

				if (!bookingResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking not found',
					});
				}

				const booking = bookingResult[0];

				if (booking.status !== 'pending') {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Booking is not pending payment',
					});
				}

				const checkout = await paymentService.createCheckoutSession(
					checkoutData.bookingId,
					checkoutData,
				);

				return checkout;
			} catch (error) {
				console.error('Failed to create checkout session:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error
							? error.message
							: 'Failed to create checkout session',
				});
			}
		}),

	/**
	 * Get booking details with payment info
	 */
	getBooking: publicProcedure
		.input(
			z.object({
				bookingId: z.string(),
				userId: z.string().optional(), // Optional for admin access
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				const whereConditions = [eq(bookings.id, input.bookingId)];

				// If userId provided, restrict to that user
				if (input.userId) {
					whereConditions.push(eq(bookings.userId, input.userId));
				}

				const bookingResult = await db
					.select()
					.from(bookings)
					.where(and(...whereConditions));

				if (!bookingResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking not found',
					});
				}

				// If no userId provided (admin access), include user data
				if (!input.userId) {
					const bookingDetails =
						await paymentService.getBookingWithPaymentAndUser(input.bookingId);
					return bookingDetails;
				} else {
					// Regular user access, no user data included
					const bookingDetails = await paymentService.getBookingWithPayment(
						input.bookingId,
					);
					return bookingDetails;
				}
			} catch (error) {
				console.error('Failed to get booking:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						error instanceof Error ? error.message : 'Failed to get booking',
				});
			}
		}),

	/**
	 * Get user's bookings with pagination
	 */
	getMyBookings: publicProcedure
		.input(
			z.object({
				userId: z.string(),
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
				status: z
					.enum(['pending', 'confirmed', 'cancelled', 'completed'])
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				const whereConditions = [eq(bookings.userId, input.userId)];

				if (input.status) {
					whereConditions.push(eq(bookings.status, input.status));
				}

				const userBookings = await db
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
					.where(and(...whereConditions))
					.orderBy(desc(bookings.createdAt))
					.limit(input.limit)
					.offset(input.offset);

				return userBookings;
			} catch (error) {
				console.error('Failed to get user bookings:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to get bookings',
				});
			}
		}),

	/**
	 * Update booking details (before payment confirmation)
	 */
	updateBooking: publicProcedure
		.input(
			updateBookingSchema.extend({
				userId: z.string(), // Temporarily require userId
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				const { userId, ...updateData } = input;

				// Verify booking belongs to user and is still pending
				const bookingResult = await db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.id, updateData.bookingId),
							eq(bookings.userId, userId),
							eq(bookings.status, 'pending'),
						),
					);

				if (!bookingResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking not found or cannot be modified',
					});
				}

				const updateFields: Record<string, any> = {
					updatedAt: new Date(),
				};

				if (updateData.specialRequests !== undefined) {
					updateFields.specialRequests = updateData.specialRequests;
				}

				if (updateData.status) {
					updateFields.status = updateData.status;
				}

				await db
					.update(bookings)
					.set(updateFields)
					.where(eq(bookings.id, updateData.bookingId));

				return { success: true };
			} catch (error) {
				console.error('Failed to update booking:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error ? error.message : 'Failed to update booking',
				});
			}
		}),

	/**
	 * Cancel booking
	 */
	cancelBooking: publicProcedure
		.input(
			cancelBookingSchema.extend({
				userId: z.string(), // Temporarily require userId
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				const { userId, ...cancelData } = input;

				// Verify booking belongs to user
				const bookingResult = await db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.id, cancelData.bookingId),
							eq(bookings.userId, userId),
						),
					);

				if (!bookingResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking not found',
					});
				}

				const booking = bookingResult[0];

				if (booking.status === 'cancelled') {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Booking is already cancelled',
					});
				}

				// Update booking status
				await db
					.update(bookings)
					.set({
						status: 'cancelled',
						paymentStatus:
							booking.paymentStatus === 'paid' ? 'refunded' : 'failed',
						cancelledAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(bookings.id, cancelData.bookingId));

				// TODO: Handle Stripe refund if payment was completed
				// TODO: Send cancellation email
				// TODO: Free up room availability dates

				return { success: true };
			} catch (error) {
				console.error('Failed to cancel booking:', error);
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message:
						error instanceof Error ? error.message : 'Failed to cancel booking',
				});
			}
		}),

	/**
	 * Admin: Get all bookings with pagination and filtering
	 */
	adminListBookings: publicProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(10),
				offset: z.number().min(0).default(0),
				status: z
					.enum(['pending', 'confirmed', 'cancelled', 'completed'])
					.optional(),
				paymentStatus: z
					.enum(['pending', 'paid', 'failed', 'refunded'])
					.optional(),
				roomId: z.string().optional(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				const conditions = [];

				if (input.status) {
					conditions.push(eq(bookings.status, input.status));
				}
				if (input.paymentStatus) {
					conditions.push(eq(bookings.paymentStatus, input.paymentStatus));
				}
				if (input.roomId) {
					conditions.push(eq(bookings.roomId, input.roomId));
				}
				if (input.startDate && input.endDate) {
					conditions.push(
						between(bookings.checkInDate, input.startDate, input.endDate),
					);
				}

				const allBookings = await db
					.select({
						booking: bookings,
						room: {
							id: room.id,
							slug: room.slug,
							basePrice: room.basePrice,
						},
						user: {
							id: user.id,
							email: user.email,
							name: user.name,
						},
					})
					.from(bookings)
					.innerJoin(room, eq(bookings.roomId, room.id))
					.innerJoin(user, eq(bookings.userId, user.id))
					.where(conditions.length > 0 ? and(...conditions) : undefined)
					.orderBy(desc(bookings.createdAt))
					.limit(input.limit)
					.offset(input.offset);

				return allBookings;
			} catch (error) {
				console.error('Failed to get admin bookings:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to get bookings',
				});
			}
		}),

	/**
	 * Admin: Get booking statistics
	 */
	adminGetStats: publicProcedure.query(async ({ ctx }) => {
		const db = createDrizzle(ctx.db);

		try {
			const allBookings = await db.select().from(bookings);

			const stats = {
				total: allBookings.length,
				pending: allBookings.filter((b: any) => b.status === 'pending').length,
				confirmed: allBookings.filter((b: any) => b.status === 'confirmed')
					.length,
				cancelled: allBookings.filter((b: any) => b.status === 'cancelled')
					.length,
				totalRevenue: allBookings
					.filter((b: any) => b.paymentStatus === 'paid')
					.reduce((sum: number, b: any) => sum + b.totalAmount, 0),
				pendingPayments: allBookings
					.filter((b: any) => b.paymentStatus === 'pending')
					.reduce((sum: number, b: any) => sum + b.totalAmount, 0),
			};

			return stats;
		} catch (error) {
			console.error('Failed to get booking stats:', error);
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Failed to get booking statistics',
			});
		}
	}),

	/**
	 * Resend booking confirmation email
	 */
	resendConfirmationEmail: publicProcedure
		.input(
			z.object({
				bookingId: z.string(),
				userId: z.string().optional(), // Optional for admin access
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);
			const paymentService = new PaymentService({
				DB: ctx.db,
				STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
				STRIPE_TRPC_WEBHOOK_SECRET:
					process.env.STRIPE_TRPC_WEBHOOK_SECRET || '',
				BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '',
			});

			try {
				// Verify the booking exists and user has access
				const whereConditions = [eq(bookings.id, input.bookingId)];
				if (input.userId) {
					whereConditions.push(eq(bookings.userId, input.userId));
				}

				const bookingResult = await db
					.select()
					.from(bookings)
					.where(and(...whereConditions));

				if (!bookingResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking not found or access denied',
					});
				}

				// Get full booking details for email
				const bookingDetails = await paymentService.getBookingWithPayment(
					input.bookingId,
				);

				if (!bookingDetails?.booking || !bookingDetails?.room) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Booking details incomplete',
					});
				}

				// Prepare email data
				const emailData: BookingEmailData = {
					confirmationId: bookingDetails.booking.confirmationId,
					guestName: bookingDetails.booking.guestName,
					guestEmail: bookingDetails.booking.guestEmail,
					guestPhone: bookingDetails.booking.guestPhone || undefined,
					roomName: bookingDetails.room.name,
					checkInDate: bookingDetails.booking.checkInDate,
					checkOutDate: bookingDetails.booking.checkOutDate,
					numberOfNights: bookingDetails.booking.numberOfNights,
					numberOfGuests: bookingDetails.booking.numberOfGuests,
					specialRequests: bookingDetails.booking.specialRequests || undefined,
					baseAmount: bookingDetails.booking.baseAmount,
					taxAmount: bookingDetails.booking.taxAmount || 0,
					feesAmount: bookingDetails.booking.feesAmount || 0,
					totalAmount: bookingDetails.booking.totalAmount,
					baseUrl: process.env.BETTER_AUTH_URL || '',
				};

				// Send the confirmation email
				const emailResult = await sendBookingConfirmationEmail(emailData, {
					RESEND_API_KEY: process.env.RESEND_API_KEY || '',
				});

				if (!emailResult.success) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: emailResult.error || 'Failed to send confirmation email',
					});
				}

				return {
					success: true,
					message: 'Confirmation email sent successfully',
				};
			} catch (error) {
				console.error('Failed to resend confirmation email:', error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to resend confirmation email',
				});
			}
		}),
});
