import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { createDrizzle } from '@/db/drizzle-init';
import { room, roomBlockedPeriods, roomPricingRules } from '@/db/schema-export';
import { iCalService } from '@/lib/ical-service';
import {
	bulkAvailabilitySchema,
	checkAvailabilitySchema,
	createBlockedPeriodSchema,
	createPricingRuleSchema,
	createRoomSchema,
	deleteBlockedPeriodSchema,
	deletePricingRuleSchema,
	getBlockedPeriodSchema,
	getBlockedPeriodsSchema,
	getPricingRulesSchema,
	getRoomSchema,
	getRoomsSchema,
	syncCalendarSchema,
	updateBlockedPeriodSchema,
	updatePricingRuleSchema,
	updateRoomSchema,
} from '@/lib/room-validation';
import { createTRPCRouter, publicProcedure } from './init';

export const roomsRouter = createTRPCRouter({
	// Simple test procedure without input
	ping: publicProcedure.query(async () => {
		return { message: 'pong', timestamp: new Date().toISOString() };
	}),

	// Get all rooms with pagination and filtering
	list: publicProcedure.input(getRoomsSchema).query(async ({ ctx, input }) => {
		const db = createDrizzle(ctx.db);

		// Build query conditions
		const conditions = [];

		// Filter by status if provided
		if (input.status) {
			conditions.push(eq(room.status, input.status));
		}

		// Legacy support: filter by isActive if provided and no status filter
		if (input.isActive !== undefined && !input.status) {
			conditions.push(eq(room.isActive, input.isActive));
		}

		// Build the query
		const baseQuery = db.select().from(room);
		const query =
			conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

		const result = await query.limit(input.limit).offset(input.offset);

		// Get total count for pagination
		const countBaseQuery = db.select().from(room);
		const countQuery =
			conditions.length > 0
				? countBaseQuery.where(and(...conditions))
				: countBaseQuery;

		const totalResult = await countQuery;
		const total = totalResult.length;

		return {
			rooms: result,
			pagination: {
				total,
				limit: input.limit,
				offset: input.offset,
				hasMore: input.offset + input.limit < total,
			},
		};
	}),

	// Get single room by ID
	get: publicProcedure.input(getRoomSchema).query(async ({ ctx, input }) => {
		const db = createDrizzle(ctx.db);

		const result = await db.select().from(room).where(eq(room.id, input.id));

		if (!result[0]) {
			throw new Error('Room not found');
		}

		return result[0];
	}),

	// Create new room (admin only - we'll add auth middleware later)
	create: publicProcedure
		.input(createRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const roomId = nanoid();
			const now = new Date();

			const newRoom = {
				id: roomId,
				name: input.name,
				slug: input.slug,
				description: input.description || null,
				basePrice: input.basePrice || 0, // Default price for now
				status: input.status || 'active',
				isActive: input.isActive,
				airbnbIcalUrl: input.airbnbIcalUrl || null,
				expediaIcalUrl: input.expediaIcalUrl || null,
				lastAirbnbSync: null,
				lastExpediaSync: null,
				createdAt: now,
				updatedAt: now,
			};

			await db.insert(room).values(newRoom);

			return newRoom;
		}),

	// Update existing room (admin only)
	update: publicProcedure
		.input(updateRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const { id, ...updateData } = input;

			const result = await db
				.update(room)
				.set({
					...updateData,
					updatedAt: new Date(),
				})
				.where(eq(room.id, id))
				.returning();

			if (!result[0]) {
				throw new Error('Room not found');
			}

			return result[0];
		}),

	// Archive room (replaces delete - preserves data for historical bookings)
	archive: publicProcedure
		.input(getRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const result = await db
				.update(room)
				.set({
					status: 'archived',
					isActive: false, // Keep legacy field in sync
					updatedAt: new Date(),
				})
				.where(eq(room.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error('Room not found');
			}

			return { success: true, id: input.id, status: 'archived' };
		}),

	// Activate room
	activate: publicProcedure
		.input(getRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const result = await db
				.update(room)
				.set({
					status: 'active',
					isActive: true, // Keep legacy field in sync
					updatedAt: new Date(),
				})
				.where(eq(room.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error('Room not found');
			}

			return { success: true, id: input.id, status: 'active' };
		}),

	// Deactivate room (temporarily unavailable)
	deactivate: publicProcedure
		.input(getRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const result = await db
				.update(room)
				.set({
					status: 'inactive',
					isActive: false, // Keep legacy field in sync
					updatedAt: new Date(),
				})
				.where(eq(room.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error('Room not found');
			}

			return { success: true, id: input.id, status: 'inactive' };
		}),

	// Check room availability
	checkAvailability: publicProcedure
		.input(checkAvailabilitySchema)
		.query(async ({ input }) => {
			// TODO: Implement availability checking logic
			// This will check against bookings and external calendars
			return {
				roomId: input.roomId,
				available: true, // Placeholder
				conflictingBookings: [],
				externalConflicts: [],
			};
		}),

	// Bulk availability check
	bulkAvailability: publicProcedure
		.input(bulkAvailabilitySchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Build query conditions - only check active rooms for availability
			const conditions = [eq(room.status, 'active')];
			if (input.roomIds && input.roomIds.length > 0) {
				conditions.push(inArray(room.id, input.roomIds));
			}

			// Execute query with all conditions
			const roomsToCheck = await db
				.select()
				.from(room)
				.where(and(...conditions));

			// TODO: Check availability for each room
			const availability = roomsToCheck.map((roomData) => ({
				roomId: roomData.id,
				roomSlug: roomData.slug,
				available: true, // Placeholder
				conflictingBookings: [],
				externalConflicts: [],
			}));

			return {
				dateRange: {
					startDate: input.startDate,
					endDate: input.endDate,
				},
				availability,
			};
		}),

	// Sync external calendar
	syncCalendar: publicProcedure
		.input(syncCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Get room to sync
			const result = await db
				.select()
				.from(room)
				.where(eq(room.id, input.roomId));

			if (!result[0]) {
				throw new Error('Room not found');
			}

			const roomData = result[0];

			// Get the appropriate calendar URL
			let calendarUrl: string | null = null;
			if (input.platform === 'airbnb') {
				calendarUrl = roomData.airbnbIcalUrl;
			} else if (input.platform === 'expedia') {
				calendarUrl = roomData.expediaIcalUrl;
			}

			if (!calendarUrl) {
				throw new Error(
					`No ${input.platform} calendar URL configured for this room`,
				);
			}

			// Use iCal service to perform the actual sync
			const icalServiceInstance = new iCalService(ctx.db);
			const syncResult = await icalServiceInstance.syncExternalCalendar(
				input.roomId,
				input.platform,
			);

			return {
				success: syncResult.success,
				syncedEvents: syncResult.bookingsProcessed,
				lastSync: new Date(),
				platform: input.platform,
				errorMessage: syncResult.errorMessage,
			};
		}),

	// Update room iCal URLs
	updateIcalUrls: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
				airbnbIcalUrl: z.string().url().optional().nullable(),
				expediaIcalUrl: z.string().url().optional().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Verify room exists
			const roomResult = await db
				.select()
				.from(room)
				.where(eq(room.id, input.roomId));

			if (!roomResult[0]) {
				throw new Error('Room not found');
			}

			// Update iCal URLs
			const updateData: Partial<typeof room.$inferInsert> = {
				updatedAt: new Date(),
			};

			if (input.airbnbIcalUrl !== undefined) {
				updateData.airbnbIcalUrl = input.airbnbIcalUrl;
			}

			if (input.expediaIcalUrl !== undefined) {
				updateData.expediaIcalUrl = input.expediaIcalUrl;
			}

			await db.update(room).set(updateData).where(eq(room.id, input.roomId));

			return {
				success: true,
				roomId: input.roomId,
				updatedUrls: {
					airbnb: input.airbnbIcalUrl,
					expedia: input.expediaIcalUrl,
				},
				updatedAt: new Date(),
			};
		}),

	// Get room iCal configuration
	getIcalConfig: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const roomResult = await db
				.select({
					id: room.id,
					slug: room.slug,
					airbnbIcalUrl: room.airbnbIcalUrl,
					expediaIcalUrl: room.expediaIcalUrl,
					lastAirbnbSync: room.lastAirbnbSync,
					lastExpediaSync: room.lastExpediaSync,
				})
				.from(room)
				.where(eq(room.id, input.roomId));

			if (!roomResult[0]) {
				throw new Error('Room not found');
			}

			const roomData = roomResult[0];

			return {
				roomId: roomData.id,
				roomSlug: roomData.slug,
				icalUrls: {
					airbnb: roomData.airbnbIcalUrl,
					expedia: roomData.expediaIcalUrl,
				},
				lastSync: {
					airbnb: roomData.lastAirbnbSync,
					expedia: roomData.lastExpediaSync,
				},
				configured: {
					airbnb: !!roomData.airbnbIcalUrl,
					expedia: !!roomData.expediaIcalUrl,
				},
				// Generate URLs for this room's calendar feed
				exportUrls: {
					byId: `/api/rooms/${roomData.id}/calendar.ics`,
					bySlug: `/api/rooms/slug/${roomData.slug}/calendar.ics`,
				},
			};
		}),

	// Test iCal URL (validate it works)
	testIcalUrl: publicProcedure
		.input(
			z.object({
				url: z.string().url(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const response = await fetch(input.url, {
					headers: {
						'User-Agent': 'Irishette Calendar Test/1.0',
					},
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const content = await response.text();

				// Basic validation
				if (!content.includes('BEGIN:VCALENDAR')) {
					throw new Error('Invalid iCal format: Missing VCALENDAR');
				}

				// Count events
				const eventCount = (content.match(/BEGIN:VEVENT/g) || []).length;
				const lines = content.split('\n').length;

				return {
					success: true,
					url: input.url,
					contentLength: content.length,
					lines,
					eventCount,
					preview: `${content.substring(0, 300)}...`,
					validatedAt: new Date(),
				};
			} catch (error) {
				return {
					success: false,
					url: input.url,
					error: error instanceof Error ? error.message : 'Unknown error',
					validatedAt: new Date(),
				};
			}
		}),

	// Pricing Rules Management
	// Get pricing rules for a room
	getPricingRules: publicProcedure
		.input(getPricingRulesSchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const conditions = [eq(roomPricingRules.roomId, input.roomId)];

			// Filter by active status if provided
			if (input.isActive !== undefined) {
				conditions.push(eq(roomPricingRules.isActive, input.isActive));
			}

			// Filter by date range if provided
			if (input.startDate) {
				conditions.push(
					lte(roomPricingRules.startDate, input.endDate || input.startDate),
				);
			}
			if (input.endDate) {
				conditions.push(
					gte(roomPricingRules.endDate, input.startDate || input.endDate),
				);
			}

			const result = await db
				.select()
				.from(roomPricingRules)
				.where(and(...conditions))
				.orderBy(roomPricingRules.startDate);

			return result;
		}),

	// Create a new pricing rule
	createPricingRule: publicProcedure
		.input(createPricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Validate that dates are not in the past
			const today = new Date();
			today.setHours(0, 0, 0, 0); // Reset time to start of day
			const startDate = new Date(input.startDate);
			const endDate = new Date(input.endDate);

			if (startDate < today) {
				throw new Error('Start date cannot be in the past');
			}

			if (endDate < today) {
				throw new Error('End date cannot be in the past');
			}

			// Check for overlapping rules
			const existingRules = await db
				.select()
				.from(roomPricingRules)
				.where(
					and(
						eq(roomPricingRules.roomId, input.roomId),
						eq(roomPricingRules.isActive, true),
						// Check for date range overlap
						gte(roomPricingRules.endDate, input.startDate),
						lte(roomPricingRules.startDate, input.endDate),
					),
				);

			if (existingRules.length > 0) {
				const overlappingRule = existingRules[0];
				throw new Error(
					`Pricing rule overlaps with existing rule "${overlappingRule.name}" (${overlappingRule.startDate} - ${overlappingRule.endDate})`,
				);
			}

			const ruleId = nanoid();
			const now = new Date();

			const newRule = {
				id: ruleId,
				roomId: input.roomId,
				name: input.name,
				ruleType: input.ruleType,
				value: input.value,
				startDate: input.startDate,
				endDate: input.endDate,
				isActive: input.isActive ?? true,
				daysOfWeek: input.daysOfWeek ? JSON.stringify(input.daysOfWeek) : null,
				createdAt: now,
				updatedAt: now,
			};

			await db.insert(roomPricingRules).values(newRule);

			return newRule;
		}),

	// Update existing pricing rule
	updatePricingRule: publicProcedure
		.input(updatePricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const { id, ...updateData } = input;

			// If date range is being updated, check for overlaps
			if (updateData.startDate || updateData.endDate) {
				// Get the current rule to get roomId and current date range
				const currentRule = await db
					.select()
					.from(roomPricingRules)
					.where(eq(roomPricingRules.id, id))
					.limit(1);

				if (!currentRule[0]) {
					throw new Error('Pricing rule not found');
				}

				const startDate = updateData.startDate || currentRule[0].startDate;
				const endDate = updateData.endDate || currentRule[0].endDate;

				// Validate that dates are not in the past
				const today = new Date();
				today.setHours(0, 0, 0, 0); // Reset time to start of day
				const startDateObj = new Date(startDate);
				const endDateObj = new Date(endDate);

				if (startDateObj < today) {
					throw new Error('Start date cannot be in the past');
				}

				if (endDateObj < today) {
					throw new Error('End date cannot be in the past');
				}

				// Check for overlapping rules (excluding the current rule being updated)
				const existingRules = await db
					.select()
					.from(roomPricingRules)
					.where(
						and(
							eq(roomPricingRules.roomId, currentRule[0].roomId),
							eq(roomPricingRules.isActive, true),
							// Check for date range overlap
							gte(roomPricingRules.endDate, startDate),
							lte(roomPricingRules.startDate, endDate),
						),
					);

				// Filter out the current rule from the results
				const overlappingRules = existingRules.filter((rule) => rule.id !== id);

				if (overlappingRules.length > 0) {
					const overlappingRule = overlappingRules[0];
					throw new Error(
						`Pricing rule overlaps with existing rule "${overlappingRule.name}" (${overlappingRule.startDate} - ${overlappingRule.endDate})`,
					);
				}
			}

			const updatedRule = {
				...updateData,
				daysOfWeek: updateData.daysOfWeek
					? JSON.stringify(updateData.daysOfWeek)
					: undefined,
				updatedAt: new Date(),
			};

			const result = await db
				.update(roomPricingRules)
				.set(updatedRule)
				.where(eq(roomPricingRules.id, id))
				.returning();

			if (!result[0]) {
				throw new Error('Pricing rule not found');
			}

			return result[0];
		}),

	// Delete pricing rule
	deletePricingRule: publicProcedure
		.input(deletePricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const result = await db
				.delete(roomPricingRules)
				.where(eq(roomPricingRules.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error('Pricing rule not found');
			}

			return { success: true, deletedRule: result[0] };
		}),

	// Calculate room pricing with dynamic rules (for frontend calendar)
	calculatePricing: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
				checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				guestCount: z.number().min(1).default(2),
			}),
		)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Get room data
			const roomResult = await db
				.select()
				.from(room)
				.where(eq(room.id, input.roomId));

			if (!roomResult[0]) {
				throw new Error('Room not found');
			}

			const roomData = roomResult[0];

			// Calculate number of nights
			const checkIn = new Date(input.checkInDate);
			const checkOut = new Date(input.checkOutDate);
			const numberOfNights = Math.ceil(
				(checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
			);

			if (numberOfNights <= 0) {
				throw new Error('Invalid date range');
			}

			// Start with base pricing
			let baseAmount = roomData.basePrice * numberOfNights;

			// Get applicable pricing rules - get all rules that might overlap
			const pricingRules = await db
				.select()
				.from(roomPricingRules)
				.where(
					and(
						eq(roomPricingRules.roomId, input.roomId),
						eq(roomPricingRules.isActive, true),
					),
				);

			const appliedRules: Array<{
				id: string;
				name: string;
				ruleType: string;
				value: number;
				appliedAmount: number;
			}> = [];

			// Calculate which nights are affected by each rule
			const stayNights: string[] = [];
			const currentDate = new Date(input.checkInDate);
			const checkOutDate = new Date(input.checkOutDate);

			// Generate array of stay nights (checkIn to checkOut, exclusive of checkOut)
			while (currentDate < checkOutDate) {
				stayNights.push(currentDate.toISOString().split('T')[0]);
				currentDate.setDate(currentDate.getDate() + 1);
			}

			// Apply pricing rules only for nights that fall within rule periods
			for (const rule of pricingRules) {
				// Find which stay nights fall within this rule's date range
				// Rule end date is EXCLUSIVE (just like checkout dates)
				const affectedNights = stayNights.filter((night) => {
					return night >= rule.startDate && night < rule.endDate;
				});

				if (affectedNights.length === 0) {
					// No nights affected by this rule
					continue;
				}

				let appliedAmount = 0;

				if (rule.ruleType === 'surcharge_rate') {
					// Percentage surcharge on base price for affected nights only
					const affectedBaseAmount = roomData.basePrice * affectedNights.length;
					appliedAmount = affectedBaseAmount * rule.value;
					baseAmount += appliedAmount;
				} else if (rule.ruleType === 'fixed_amount') {
					// Fixed amount per affected night
					appliedAmount = rule.value * affectedNights.length;
					baseAmount += appliedAmount;
				} else if (rule.ruleType === 'absolute_price') {
					// Override with absolute price for affected nights only
					const originalAffectedAmount =
						roomData.basePrice * affectedNights.length;
					const newAffectedAmount = rule.value * affectedNights.length;
					appliedAmount = newAffectedAmount - originalAffectedAmount;
					baseAmount = baseAmount - originalAffectedAmount + newAffectedAmount;
				}

				if (appliedAmount !== 0) {
					appliedRules.push({
						id: rule.id,
						name: rule.name,
						ruleType: rule.ruleType,
						value: rule.value,
						appliedAmount,
					});
				}
			}

			// For the calendar component, we only return the room rate (no fees/taxes)
			// Fees and taxes will be calculated later in the booking flow
			return {
				baseAmount: baseAmount, // This includes base price + pricing rules
				numberOfNights,
				appliedRules,
				roomBasePrice: roomData.basePrice,
			};
		}),

	// Room blocking procedures
	getBlockedPeriods: publicProcedure
		.input(getBlockedPeriodsSchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Build query conditions
			const conditions = [];

			// Filter by room if provided
			if (input.roomId) {
				conditions.push(eq(roomBlockedPeriods.roomId, input.roomId));
			}

			// Filter by date range if provided
			if (input.startDate) {
				conditions.push(lte(roomBlockedPeriods.startDate, input.startDate));
			}

			if (input.endDate) {
				conditions.push(gte(roomBlockedPeriods.endDate, input.endDate));
			}

			// Build the query
			const baseQuery = db.select().from(roomBlockedPeriods);
			const query =
				conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

			const result = await query
				.limit(input.limit)
				.offset(input.offset)
				.orderBy(roomBlockedPeriods.startDate);

			return result;
		}),

	getBlockedPeriod: publicProcedure
		.input(getBlockedPeriodSchema)
		.query(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			const result = await db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id))
				.limit(1);

			if (result.length === 0) {
				throw new Error('Blocked period not found');
			}

			return result[0];
		}),

	createBlockedPeriod: publicProcedure
		.input(createBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Check if room exists
			const roomExists = await db
				.select({ id: room.id })
				.from(room)
				.where(eq(room.id, input.roomId))
				.limit(1);

			if (roomExists.length === 0) {
				throw new Error('Room not found');
			}

			// Check for overlapping blocked periods
			const overlapping = await db
				.select()
				.from(roomBlockedPeriods)
				.where(
					and(
						eq(roomBlockedPeriods.roomId, input.roomId),
						lte(roomBlockedPeriods.startDate, input.endDate),
						gte(roomBlockedPeriods.endDate, input.startDate),
					),
				);

			if (overlapping.length > 0) {
				throw new Error(
					'This date range overlaps with an existing blocked period',
				);
			}

			const id = nanoid();
			const newPeriod = {
				id,
				roomId: input.roomId,
				startDate: input.startDate,
				endDate: input.endDate,
				reason: input.reason,
				notes: input.notes || null,
				createdAt: new Date(),
			};

			await db.insert(roomBlockedPeriods).values(newPeriod);

			return newPeriod;
		}),

	updateBlockedPeriod: publicProcedure
		.input(updateBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Check if blocked period exists
			const existing = await db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id))
				.limit(1);

			if (existing.length === 0) {
				throw new Error('Blocked period not found');
			}

			const existingPeriod = existing[0];

			// If dates are being updated, check for overlaps with other periods
			if (input.startDate || input.endDate) {
				const startDate = input.startDate || existingPeriod.startDate;
				const endDate = input.endDate || existingPeriod.endDate;

				const overlapping = await db
					.select()
					.from(roomBlockedPeriods)
					.where(
						and(
							eq(roomBlockedPeriods.roomId, existingPeriod.roomId),
							lte(roomBlockedPeriods.startDate, endDate),
							gte(roomBlockedPeriods.endDate, startDate),
							// Exclude the current period from overlap check
							eq(roomBlockedPeriods.id, input.id),
						),
					);

				if (overlapping.length > 1) {
					// More than 1 means there are overlaps besides itself
					throw new Error(
						'This date range overlaps with an existing blocked period',
					);
				}
			}

			// Build update object with only provided fields
			const updateData: Partial<typeof existingPeriod> = {};
			if (input.startDate) updateData.startDate = input.startDate;
			if (input.endDate) updateData.endDate = input.endDate;
			if (input.reason) updateData.reason = input.reason;
			if (input.notes !== undefined) updateData.notes = input.notes || null;

			await db
				.update(roomBlockedPeriods)
				.set(updateData)
				.where(eq(roomBlockedPeriods.id, input.id));

			// Return updated period
			const updated = await db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id))
				.limit(1);

			return updated[0];
		}),

	deleteBlockedPeriod: publicProcedure
		.input(deleteBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			const db = createDrizzle(ctx.db);

			// Check if blocked period exists
			const existing = await db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id))
				.limit(1);

			if (existing.length === 0) {
				throw new Error('Blocked period not found');
			}

			await db
				.delete(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id));

			return { success: true, id: input.id };
		}),

	// Generate iCal feed for a room
	generateIcal: publicProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const icalService = new iCalService(ctx.db);

			// Check if room exists
			const db = createDrizzle(ctx.db);
			const roomExists = await db
				.select()
				.from(room)
				.where(eq(room.id, input.roomId))
				.limit(1);

			if (roomExists.length === 0) {
				throw new Error('Room not found');
			}

			const icalContent = await icalService.generateICalForRoom(input.roomId);

			return {
				roomId: input.roomId,
				icalContent,
				contentType: 'text/calendar',
				filename: `room-${input.roomId}.ics`,
			};
		}),
});
