import { TRPCError } from '@trpc/server';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDrizzle } from '@/db/drizzle-init';
import { bookings, user } from '@/db/schema-export';
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
			const db = createDrizzle(ctx.db);

			try {
				// Get all users with role 'user' with their booking count
				const guests = await db
					.select({
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							createdAt: user.createdAt,
							stripeCustomerId: user.stripeCustomerId,
							phoneNumber: user.phoneNumber, // Use phone from user table
						},
						bookingCount: count(bookings.id),
					})
					.from(user)
					.leftJoin(bookings, eq(user.id, bookings.userId))
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
				userId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				// Get user details
				const userResult = await db
					.select()
					.from(user)
					.where(eq(user.id, input.userId));

				if (!userResult[0]) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Guest not found',
					});
				}

				// Get all bookings for this user
				const userBookings = await db
					.select()
					.from(bookings)
					.where(eq(bookings.userId, input.userId))
					.orderBy(bookings.createdAt);

				return {
					user: userResult[0],
					bookings: userBookings,
				};
			} catch (error) {
				console.error('Failed to get guest details:', error);
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
			const db = createDrizzle(ctx.db);

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
	 * Update user profile (name, email, phone number)
	 */
	updateProfile: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1, 'Name is required').optional(),
				email: z.email('Invalid email address').optional(),
				phoneNumber: z
					.string()
					.min(10, 'Phone number must be at least 10 digits')
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				// Use authenticated user's ID from session
				const userId = ctx.user.id;

				// Build the update object dynamically
				const updateData: {
					name?: string;
					email?: string;
					phoneNumber?: string;
					updatedAt: Date;
				} = {
					updatedAt: new Date(),
				};

				if (input.name !== undefined) {
					updateData.name = input.name;
				}
				if (input.email !== undefined) {
					updateData.email = input.email;
				}
				if (input.phoneNumber !== undefined) {
					updateData.phoneNumber = input.phoneNumber;
				}

				// Update the user's profile
				await db.update(user).set(updateData).where(eq(user.id, userId));

				return {
					success: true,
					message: 'Profile updated successfully',
				};
			} catch (error) {
				console.error('Failed to update profile:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						error instanceof Error ? error.message : 'Failed to update profile',
				});
			}
		}),
});
