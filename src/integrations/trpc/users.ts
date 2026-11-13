import { TRPCError } from '@trpc/server';
import { isAPIError } from 'better-auth/api';
import { and, count, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '@/db/drizzle-init';
import {
	account,
	bookings,
	notificationPreferences,
	user,
} from '@/db/schema-export';
import { auth } from '@/lib/auth/auth';
import { setPasswordSchema } from '@/lib/auth/auth-validation';
import {
	updateNotificationPreferencesSchema,
	updateProfileSchema,
} from '@/lib/auth/user-validation';
import { listDisputes } from '@/lib/booking/dispute-service';
import { stayPhase } from '@/lib/booking/stay-times';
import {
	defaultNotificationPreferences,
	type NotificationCategory,
} from '@/lib/email/notification-categories';
import { isUniqueViolation } from '@/utils/db-errors';
import { publicIdSchema } from '@/utils/ids';

import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	rateLimit,
} from './init';

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

/** The caller's email setting per category (no stored row = on). */
async function notificationSettings(db: Database, userId: string) {
	const rows = await db
		.select({
			category: notificationPreferences.category,
			emailEnabled: notificationPreferences.emailEnabled,
		})
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId));
	const settings = defaultNotificationPreferences();
	for (const row of rows) settings[row.category] = row.emailEnabled;
	return settings;
}

/** Better Auth error codes from setPassword, as tRPC errors. */
function setPasswordError(error: unknown): TRPCError {
	const code = isAPIError(error) ? error.body?.code : undefined;
	switch (code) {
		case 'PASSWORD_ALREADY_SET':
			return new TRPCError({
				code: 'CONFLICT',
				message:
					'This account already has a password. Change it with your current password instead.',
			});
		case 'PASSWORD_TOO_SHORT':
		case 'PASSWORD_TOO_LONG':
			return new TRPCError({
				code: 'BAD_REQUEST',
				message: 'Password must be 8 to 100 characters.',
			});
		case 'UNAUTHORIZED':
			return new TRPCError({
				code: 'UNAUTHORIZED',
				message: 'Your session has expired. Please sign in again.',
			});
		default:
			return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: error });
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
			const disputes = await listDisputes(ctx.db, { userId: internalId });
			const now = new Date();
			return {
				user: profile,
				bookings: userBookings.map((b) => ({
					...b,
					stayPhase: stayPhase(b, now),
				})),
				disputes,
			};
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

	/**
	 * /admin/settings: the caller's own profile (fresh from D1, not the
	 * cached session), whether the account has a password (magic-link-only
	 * accounts have none) and their email notification settings.
	 */
	adminGetAccountSettings: adminProcedure.query(async ({ ctx }) => {
		const [[profile], [credential], notifications] = await Promise.all([
			ctx.db
				.select({
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					phoneNumber: user.phoneNumber,
				})
				.from(user)
				.where(eq(user.id, ctx.user.id)),
			ctx.db
				.select({ id: account.id })
				.from(account)
				.where(
					and(
						eq(account.userId, ctx.user.id),
						eq(account.providerId, 'credential'),
						isNotNull(account.password),
					),
				)
				.limit(1),
			notificationSettings(ctx.db, ctx.user.id),
		]);
		if (!profile) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
		}
		return { profile, hasPassword: Boolean(credential), notifications };
	}),

	/**
	 * Turns the caller's admin emails on or off per category (upsert). Returns
	 * every category's setting.
	 */
	adminUpdateNotificationPreferences: adminProcedure
		.input(updateNotificationPreferencesSchema)
		.mutation(async ({ ctx, input }) => {
			const entries = Object.entries(input.preferences) as Array<
				[NotificationCategory, boolean]
			>;
			if (entries.length > 0) {
				const now = new Date();
				await ctx.db
					.insert(notificationPreferences)
					.values(
						entries.map(([category, emailEnabled]) => ({
							userId: ctx.user.id,
							category,
							emailEnabled,
							updatedAt: now,
						})),
					)
					.onConflictDoUpdate({
						target: [
							notificationPreferences.userId,
							notificationPreferences.category,
						],
						set: {
							emailEnabled: sql`excluded.email_enabled`,
							updatedAt: sql`excluded.updated_at`,
						},
					});
			}
			return notificationSettings(ctx.db, ctx.user.id);
		}),

	/**
	 * A first password for an admin who signs in by magic link only. Better
	 * Auth's setPassword is server-only, so it runs here with the caller's
	 * session cookie. Changing an existing password goes through Better Auth's
	 * changePassword (client, checks the current password); an account that
	 * already has one is CONFLICT.
	 */
	adminSetPassword: adminProcedure
		.use(rateLimit('API_RATE_LIMITER', 'users.adminSetPassword'))
		.input(setPasswordSchema)
		.mutation(async ({ ctx, input }) => {
			const authInstance = await auth();
			try {
				await authInstance.api.setPassword({
					body: { newPassword: input.newPassword },
					headers: ctx.headers,
				});
			} catch (error) {
				throw setPasswordError(error);
			}
			return { success: true };
		}),
});
