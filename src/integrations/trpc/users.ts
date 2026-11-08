import { TRPCError } from '@trpc/server';
import { and, count, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '@/db/drizzle-init';
import { bookings, user } from '@/db/schema-export';
import { isUniqueViolation } from '@/lib/db-errors';
import { publicIdSchema } from '@/lib/ids';
import { updateProfileSchema } from '@/lib/user-validation';

import { adminProcedure, createTRPCRouter, protectedProcedure } from './init';

// Unexpected errors propagate: errorFormatter hides them from the client and
// the tRPC handler's onError logs them once (src/routes/api/trpc.$.ts).

const phoneInUse = () =>
	new TRPCError({
		code: 'CONFLICT',
		message: 'This phone number is already used by another account',
	});

/** Updates the caller's own user row; a duplicate phone number is CONFLICT. */
async function updateOwnUser(
	ctx: { db: Database; user: { id: string } },
	changes: Partial<Pick<typeof user.$inferInsert, 'name' | 'phoneNumber'>>,
) {
	try {
		await ctx.db
			.update(user)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(user.id, ctx.user.id));
	} catch (error) {
		if (isUniqueViolation(error)) throw phoneInUse();
		throw error;
	}
}

export const usersRouter = createTRPCRouter({
	/** Guests (role 'user') with their booking count (pending holds excluded). */
	adminListGuests: adminProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const [guests, [{ total }]] = await Promise.all([
				ctx.db
					.select({
						user: {
							id: user.id,
							publicId: user.publicId,
							name: user.name,
							email: user.email,
							createdAt: user.createdAt,
							stripeCustomerId: user.stripeCustomerId,
							phoneNumber: user.phoneNumber,
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
					.offset(input.offset),
				ctx.db
					.select({ total: count() })
					.from(user)
					.where(eq(user.role, 'user')),
			]);
			return {
				guests,
				total,
				hasMore: input.offset + input.limit < total,
			};
		}),

	/** A guest's profile (explicit columns) and their bookings (no holds). */
	adminGetGuestDetails: adminProcedure
		.input(z.object({ publicId: publicIdSchema }))
		.query(async ({ ctx, input }) => {
			const [guest] = await ctx.db
				.select({
					publicId: user.publicId,
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					phoneNumber: user.phoneNumber,
					role: user.role,
					stripeCustomerId: user.stripeCustomerId,
					createdAt: user.createdAt,
					internalId: user.id,
				})
				.from(user)
				.where(eq(user.publicId, input.publicId));
			if (!guest) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Guest not found' });
			}
			const { internalId, ...profile } = guest;
			const userBookings = await ctx.db
				.select()
				.from(bookings)
				.where(
					and(eq(bookings.userId, internalId), ne(bookings.status, 'pending')),
				)
				.orderBy(bookings.createdAt);
			return { user: profile, bookings: userBookings };
		}),

	/**
	 * The caller's own name and phone number (the only way to change the
	 * phone: Better Auth's user.additionalFields.phoneNumber has input: false).
	 * A phone number used by another account is CONFLICT.
	 */
	updateProfile: protectedProcedure
		.input(updateProfileSchema)
		.mutation(async ({ ctx, input }) => {
			await updateOwnUser(ctx, {
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.phoneNumber !== undefined
					? { phoneNumber: input.phoneNumber }
					: {}),
			});
			return { success: true, message: 'Profile updated successfully' };
		}),
});
