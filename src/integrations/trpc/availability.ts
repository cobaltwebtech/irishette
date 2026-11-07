import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { room } from '@/db/schema-export';
import { loadUnavailability } from '@/lib/availability';
import { addDays, isoDateSchema } from '@/lib/date-range';
import { todayIn } from '@/lib/timezone';
import { createTRPCRouter, publicProcedure } from './init';

export const availabilityRouter = createTRPCRouter({
	/**
	 * Unavailable date ranges for a room's booking calendar. Dates only: no
	 * booking ids, confirmation ids or guest data. The calendar applies the
	 * same rules as the server (src/lib/date-range.ts).
	 */
	getBySlug: publicProcedure
		.input(
			z.object({
				roomSlug: z.string().min(1).max(100),
				startDate: isoDateSchema.optional(),
				endDate: isoDateSchema.optional(),
				monthsAhead: z.number().int().min(1).max(12).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const [roomRow] = await ctx.db
				.select({
					id: room.id,
					publicId: room.publicId,
					name: room.name,
					slug: room.slug,
					basePrice: room.basePrice,
					maxGuests: room.maxGuests,
					status: room.status,
				})
				.from(room)
				.where(and(eq(room.slug, input.roomSlug), eq(room.status, 'active')));
			if (!roomRow) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
			}
			const startDate = input.startDate ?? todayIn();
			const endDate =
				input.endDate ??
				addDays(startDate, Math.round(input.monthsAhead * 30.5));
			if (endDate < startDate) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'endDate must not be before startDate',
				});
			}
			// [startDate, endDate] inclusive → nights up to endDate.
			const { unavailability } = await loadUnavailability(
				ctx.db,
				roomRow.id,
				startDate,
				addDays(endDate, 1),
			);
			return {
				room: roomRow,
				dateRange: { startDate, endDate },
				unavailability,
			};
		}),
});
