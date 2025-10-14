import { TRPCError } from '@trpc/server';
import { count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createDrizzle } from '@/db/drizzle-init';
import { bookings, user } from '@/db/schema-export';
import { createTRPCRouter, publicProcedure } from './init';

export const usersRouter = createTRPCRouter({
	/**
	 * Admin: Get all users with role 'user' (customers/guests) with booking count
	 */
	adminListGuests: publicProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			try {
				// Get all users with role 'user' with their booking count and latest phone
				const guests = await db
					.select({
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							createdAt: user.createdAt,
							stripeCustomerId: user.stripeCustomerId,
						},
						bookingCount: count(bookings.id),
						// Get the most recent phone number from bookings
						latestPhone: sql<string | null>`(
							SELECT ${bookings.guestPhone}
							FROM ${bookings}
							WHERE ${bookings.userId} = ${user.id}
							AND ${bookings.guestPhone} IS NOT NULL
							ORDER BY ${bookings.createdAt} DESC
							LIMIT 1
						)`,
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
	adminGetGuestDetails: publicProcedure
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
});
