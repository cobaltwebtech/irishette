import { TRPCError } from '@trpc/server';
import { and, count, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { bookings, user } from '@/db/schema-export';
import { publicIdSchema } from '@/lib/ids';
import { adminProcedure, createTRPCRouter, protectedProcedure } from './init';

export const usersRouter = createTRPCRouter({
	/**
	 * Admin: Get all users with role 'user' (customers/guests) with booking count
	 */
	adminListGuests: adminProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = ctx.db;

			try {
				// Get all users with role 'user' with their booking count (excluding pending bookings)
				const guests = await db
					.select({
						user: {
							id: user.id,
							publicId: user.publicId,
							name: user.name,
							email: user.email,
							createdAt: user.createdAt,
							stripeCustomerId: user.stripeCustomerId,
							phoneNumber: user.phoneNumber, // Use phone from user table
						},
						bookingCount: count(bookings.id),
					})
					.from(user)
					.leftJoin(
						bookings,
						and(eq(user.id, bookings.userId), ne(bookings.status, 'pending')),
					)
					.where(eq(user.role, 'user'))
					.groupBy(user.id)
					.orderBy(user.name)
					.limit(input.limit)
					.offset(input.offset);

				// Get total count for pagination
				const totalResult = await db
					.select({ count: count() })
					.from(user)
					.where(eq(user.role, 'user'));

				const total = totalResult[0]?.count || 0;

				return {
					guests,
					total,
					hasMore: input.offset + input.limit < total,
				};
			} catch (error) {
				console.error('Failed to get guests:', error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to get guest list',
				});
			}
		}),

	/**
	 * Admin: Get detailed guest information including all their bookings
	 */
	adminGetGuestDetails: adminProcedure
		.input(
			z.object({
				publicId: publicIdSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = ctx.db;

			try {
				// Get user details
				const userResult = await db
					.select()
					.from(user)
					.where(eq(user.publicId, input.publicId));

				if (!userResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Guest not found',
					});
				}

				// Get all bookings for this user (excluding pending bookings)
				const userBookings = await db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.userId, userResult[0].id),
							ne(bookings.status, 'pending'),
						),
					)
					.orderBy(bookings.createdAt);

				return {
					user: userResult[0],
					bookings: userBookings,
				};
			} catch (error) {
				console.error('Failed to get guest details:', error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						error instanceof Error
							? error.message
							: 'Failed to get guest details',
				});
			}
		}),

	/**
	 * Update user's phone number (for logged-in users)
	 */
	updatePhoneNumber: protectedProcedure
		.input(
			z.object({
				phoneNumber: z
					.string()
					.min(10, 'Phone number must be at least 10 digits'),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = ctx.db;

			try {
				// Use authenticated user's ID from session
				const userId = ctx.user.id;

				// Update the user's phone number
				await db
					.update(user)
					.set({
						phoneNumber: input.phoneNumber,
						updatedAt: new Date(),
					})
					.where(eq(user.id, userId));

				return {
					success: true,
					message: 'Phone number updated successfully',
				};
			} catch (error) {
				console.error('Failed to update phone number:', error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						error instanceof Error
							? error.message
							: 'Failed to update phone number',
				});
			}
		}),

	/**
	 * Update the user's name and phone number. Email changes go through Better
	 * Auth's changeEmail (verified by email), never through here.
	 */
	updateProfile: protectedProcedure
		.input(
			z.object({
				name: z.string().trim().min(1, 'Name is required').max(100).optional(),
				phoneNumber: z
					.string()
					.trim()
					.min(10, 'Phone number must be at least 10 digits')
					.max(20)
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db
					.update(user)
					.set({
						...(input.name !== undefined ? { name: input.name } : {}),
						...(input.phoneNumber !== undefined
							? { phoneNumber: input.phoneNumber }
							: {}),
						updatedAt: new Date(),
					})
					.where(eq(user.id, ctx.user.id));
			} catch (error) {
				if (
					error instanceof Error &&
					/UNIQUE constraint failed/i.test(
						`${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`,
					)
				) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'This phone number is already used by another account',
					});
				}
				throw error;
			}
			return { success: true, message: 'Profile updated successfully' };
		}),
});
