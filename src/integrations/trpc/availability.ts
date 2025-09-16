import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { createDrizzle } from '@/db/drizzle-init';
import {
	bookings,
	icalSyncLog,
	room,
	roomAvailability,
} from '@/db/schema-export';
import { iCalService } from '@/lib/ical-service';
import { createTRPCRouter, publicProcedure } from './init';

const checkAvailabilitySchema = z.object({
	roomId: z.string(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

const bulkAvailabilitySchema = z.object({
	roomIds: z.array(z.string()).optional(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

const syncCalendarSchema = z.object({
	roomId: z.string(),
	platform: z.enum(['airbnb', 'expedia']),
});

const syncAllCalendarsSchema = z.object({
	roomIds: z.array(z.string()).optional(),
});

export const availabilityRouter = createTRPCRouter({
	// Check availability for a specific room
	checkRoom: publicProcedure
		.input(checkAvailabilitySchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Validate date range
			const startDate = new Date(input.startDate);
			const endDate = new Date(input.endDate);

			if (startDate >= endDate) {
				throw new Error('Start date must be before end date');
			}

			// Check if room exists and is active
			const roomResult = await db
				.select()
				.from(room)
				.where(and(eq(room.id, input.roomId), eq(room.isActive, true)));

			if (!roomResult[0]) {
				throw new Error('Room not found or inactive');
			}

			// Check availability records for the date range (blocked dates)
			const availabilityResult = await db
				.select()
				.from(roomAvailability)
				.where(
					and(
						eq(roomAvailability.roomId, input.roomId),
						gte(roomAvailability.date, input.startDate),
						lte(roomAvailability.date, input.endDate),
						eq(roomAvailability.isBlocked, true),
					),
				);

			// Check confirmed bookings for overlapping date ranges
			const bookingResult = await db
				.select()
				.from(bookings)
				.where(
					and(
						eq(bookings.roomId, input.roomId),
						eq(bookings.status, 'confirmed'),
						// Check for overlapping date ranges: booking starts before our end AND booking ends after our start
						or(
							and(
								lte(bookings.checkInDate, input.endDate),
								gte(bookings.checkOutDate, input.startDate),
							),
						),
					),
				);

			const conflictingAvailability = availabilityResult.map((record) => ({
				date: record.date,
				source: record.source,
				externalBookingId: record.externalBookingId,
			}));

			const conflictingBookings = bookingResult.map((booking) => ({
				bookingId: booking.id,
				confirmationId: booking.confirmationId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
			}));

			const isAvailable =
				conflictingAvailability.length === 0 &&
				conflictingBookings.length === 0;

			return {
				roomId: input.roomId,
				startDate: input.startDate,
				endDate: input.endDate,
				available: isAvailable,
				conflictingBookings,
				externalConflicts: conflictingAvailability,
				room: {
					slug: roomResult[0].slug,
					basePrice: roomResult[0].basePrice,
				},
			};
		}),

	// Bulk availability check for multiple rooms
	checkBulk: publicProcedure
		.input(bulkAvailabilitySchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Validate date range
			const startDate = new Date(input.startDate);
			const endDate = new Date(input.endDate);

			if (startDate >= endDate) {
				throw new Error('Start date must be before end date');
			}

			// Get rooms to check
			const conditions = [eq(room.isActive, true)];
			if (input.roomIds && input.roomIds.length > 0) {
				conditions.push(inArray(room.id, input.roomIds));
			}

			const roomsResult = await db
				.select()
				.from(room)
				.where(and(...conditions));

			const availability = [];

			for (const roomData of roomsResult) {
				// Check availability for each room
				const availabilityResult = await db
					.select()
					.from(roomAvailability)
					.where(
						and(
							eq(roomAvailability.roomId, roomData.id),
							gte(roomAvailability.date, input.startDate),
							lte(roomAvailability.date, input.endDate),
							eq(roomAvailability.isBlocked, true),
						),
					);

				const bookingResult = await db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.roomId, roomData.id),
							eq(bookings.status, 'confirmed'),
							or(
								and(
									lte(bookings.checkInDate, input.endDate),
									gte(bookings.checkOutDate, input.startDate),
								),
							),
						),
					);

				const isAvailable =
					availabilityResult.length === 0 && bookingResult.length === 0;

				availability.push({
					roomId: roomData.id,
					roomSlug: roomData.slug,
					basePrice: roomData.basePrice,
					available: isAvailable,
					conflictCount: availabilityResult.length + bookingResult.length,
					lastAirbnbSync: roomData.lastAirbnbSync,
					lastExpediaSync: roomData.lastExpediaSync,
				});
			}

			return {
				dateRange: {
					startDate: input.startDate,
					endDate: input.endDate,
				},
				availability,
				totalRooms: roomsResult.length,
			};
		}),

	// Sync external calendar for a specific room
	syncCalendar: publicProcedure
		.input(syncCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const icalService = new iCalService(ctx.db);

			const result = await icalService.syncExternalCalendar(
				input.roomId,
				input.platform,
			);

			if (!result.success) {
				throw new Error(result.errorMessage || 'Sync failed');
			}

			return {
				success: true,
				roomId: input.roomId,
				platform: input.platform,
				bookingsProcessed: result.bookingsProcessed,
				syncedAt: new Date(),
			};
		}),

	// Sync all external calendars
	syncAllCalendars: publicProcedure
		.input(syncAllCalendarsSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);
			const icalService = new iCalService(ctx.db);

			// Get rooms to sync
			const conditions = [eq(room.isActive, true)];
			if (input.roomIds && input.roomIds.length > 0) {
				conditions.push(inArray(room.id, input.roomIds));
			}

			const roomsResult = await db
				.select()
				.from(room)
				.where(and(...conditions));

			const results = [];

			for (const roomData of roomsResult) {
				// Sync Airbnb if URL exists
				if (roomData.airbnbIcalUrl) {
					const airbnbResult = await icalService.syncExternalCalendar(
						roomData.id,
						'airbnb',
					);
					results.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'airbnb',
						...airbnbResult,
					});
				}

				// Sync expedia if URL exists
				if (roomData.expediaIcalUrl) {
					const bookingResult = await icalService.syncExternalCalendar(
						roomData.id,
						'expedia',
					);
					results.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'expedia',
						...bookingResult,
					});
				}
			}

			const successfulSyncs = results.filter((r) => r.success).length;
			const failedSyncs = results.filter((r) => !r.success).length;

			return {
				totalRooms: roomsResult.length,
				totalSyncAttempts: results.length,
				successfulSyncs,
				failedSyncs,
				syncResults: results,
				syncedAt: new Date(),
			};
		}),

	// Get availability calendar for a room (for admin dashboard)
	getCalendar: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Validate room exists
			const roomResult = await db
				.select()
				.from(room)
				.where(eq(room.id, input.roomId));

			if (!roomResult[0]) {
				throw new Error('Room not found');
			}

			const availabilityResult = await db
				.select()
				.from(roomAvailability)
				.where(
					and(
						eq(roomAvailability.roomId, input.roomId),
						gte(roomAvailability.date, input.startDate),
						lte(roomAvailability.date, input.endDate),
					),
				);

			return {
				roomId: input.roomId,
				roomSlug: roomResult[0].slug,
				dateRange: {
					startDate: input.startDate,
					endDate: input.endDate,
				},
				calendar: availabilityResult.map((record) => ({
					date: record.date,
					available: record.isAvailable,
					blocked: record.isBlocked,
					source: record.source,
					priceOverride: record.priceOverride,
					externalBookingId: record.externalBookingId,
				})),
				lastSync: {
					airbnb: roomResult[0].lastAirbnbSync,
					expedia: roomResult[0].lastExpediaSync,
				},
			};
		}),

	// Get sync logs for monitoring
	getSyncLogs: publicProcedure
		.input(
			z.object({
				roomId: z.string().optional(),
				platform: z.enum(['airbnb', 'expedia']).optional(),
				limit: z.number().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const conditions = [];
			if (input.roomId) {
				conditions.push(eq(icalSyncLog.roomId, input.roomId));
			}
			if (input.platform) {
				conditions.push(eq(icalSyncLog.platform, input.platform));
			}

			const logs =
				conditions.length > 0
					? await db
							.select()
							.from(icalSyncLog)
							.where(and(...conditions))
							.orderBy(icalSyncLog.createdAt)
							.limit(input.limit)
					: await db
							.select()
							.from(icalSyncLog)
							.orderBy(icalSyncLog.createdAt)
							.limit(input.limit);

			return {
				logs: logs.map((log) => ({
					id: log.id,
					roomId: log.roomId,
					platform: log.platform,
					status: log.status,
					bookingsProcessed: log.bookingsProcessed,
					errorMessage: log.errorMessage,
					syncDuration: log.syncDuration,
					createdAt: log.createdAt,
				})),
				totalLogs: logs.length,
			};
		}),

	// Get availability by room slug for frontend calendar (customer-facing)
	getBySlug: publicProcedure
		.input(
			z.object({
				roomSlug: z.string(),
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional(),
				endDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional(),
				monthsAhead: z.number().min(1).max(12).default(3),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Find room by slug
			const roomResult = await db
				.select()
				.from(room)
				.where(and(eq(room.slug, input.roomSlug), eq(room.isActive, true)));

			if (!roomResult[0]) {
				throw new Error('Room not found or inactive');
			}

			const roomData = roomResult[0];

			// Calculate date range if not provided
			const today = new Date();
			const startDate = input.startDate || today.toISOString().split('T')[0];
			const defaultEndDate = new Date(today);
			defaultEndDate.setMonth(today.getMonth() + input.monthsAhead);
			const endDate =
				input.endDate || defaultEndDate.toISOString().split('T')[0];

			// Get availability records for the date range
			const availabilityResult = await db
				.select()
				.from(roomAvailability)
				.where(
					and(
						eq(roomAvailability.roomId, roomData.id),
						gte(roomAvailability.date, startDate),
						lte(roomAvailability.date, endDate),
					),
				);

			// Get confirmed bookings for the date range
			const bookingResult = await db
				.select()
				.from(bookings)
				.where(
					and(
						eq(bookings.roomId, roomData.id),
						eq(bookings.status, 'confirmed'),
						lte(bookings.checkInDate, endDate),
						gte(bookings.checkOutDate, startDate),
					),
				);

			// Create a map of dates with their availability status
			const dateMap = new Map<
				string,
				{
					available: boolean;
					blocked: boolean;
					price?: number;
					source?: string;
					booking?: {
						id: string;
						confirmationId: string;
						checkInDate: string;
						checkOutDate: string;
					};
				}
			>();

			// Process availability records
			for (const record of availabilityResult) {
				dateMap.set(record.date, {
					available: record.isAvailable ?? true,
					blocked: record.isBlocked ?? false,
					price: record.priceOverride || roomData.basePrice,
					source: record.source || undefined,
				});
			}

			// Process booking records - mark dates as unavailable
			for (const booking of bookingResult) {
				const checkIn = new Date(booking.checkInDate);
				const checkOut = new Date(booking.checkOutDate);

				// Mark all dates in booking range as unavailable
				for (
					let d = new Date(checkIn);
					d < checkOut;
					d.setDate(d.getDate() + 1)
				) {
					const dateKey = d.toISOString().split('T')[0];
					if (dateKey >= startDate && dateKey <= endDate) {
						dateMap.set(dateKey, {
							available: false,
							blocked: true,
							price: roomData.basePrice,
							source: 'booking',
							booking: {
								id: booking.id,
								confirmationId: booking.confirmationId,
								checkInDate: booking.checkInDate,
								checkOutDate: booking.checkOutDate,
							},
						});
					}
				}
			}

			// Fill in missing dates as available (assuming no record means available)
			const calendar = [];
			const current = new Date(startDate);
			const end = new Date(endDate);

			while (current <= end) {
				const dateKey = current.toISOString().split('T')[0];
				const existingData = dateMap.get(dateKey);

				calendar.push({
					date: dateKey,
					available: existingData?.available ?? true,
					blocked: existingData?.blocked ?? false,
					price: existingData?.price ?? roomData.basePrice,
					source: existingData?.source ?? null,
					booking: existingData?.booking ?? null,
				});

				current.setDate(current.getDate() + 1);
			}

			return {
				room: {
					id: roomData.id,
					name: roomData.name,
					slug: roomData.slug,
					basePrice: roomData.basePrice,
					status: roomData.status,
					lastAirbnbSync: roomData.lastAirbnbSync,
					lastExpediaSync: roomData.lastExpediaSync,
				},
				dateRange: {
					startDate,
					endDate,
				},
				calendar,
				summary: {
					totalDays: calendar.length,
					availableDays: calendar.filter((d) => d.available && !d.blocked)
						.length,
					blockedDays: calendar.filter((d) => d.blocked).length,
					bookings: bookingResult.length,
				},
			};
		}),
});
