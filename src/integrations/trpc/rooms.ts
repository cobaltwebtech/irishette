import { eq, and, inArray } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure } from './init'
import { createDrizzle } from '@/db/drizzle-init'
import { room } from '@/db/schema-export'
import {
  createRoomSchema,
  updateRoomSchema,
  getRoomSchema,
  getRoomsSchema,
  checkAvailabilitySchema,
  bulkAvailabilitySchema,
  syncCalendarSchema,
} from '@/lib/room-validation'
import { nanoid } from 'nanoid'

export const roomsRouter = createTRPCRouter({
  // Get all rooms with pagination and filtering
  list: publicProcedure
    .input(getRoomsSchema)
    .query(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      // Build the complete query in one go
      const baseQuery = db.select().from(room)
      const query = input.isActive !== undefined 
        ? baseQuery.where(eq(room.isActive, input.isActive))
        : baseQuery
      
      const result = await query
        .limit(input.limit)
        .offset(input.offset)
      
      // Get total count for pagination
      const countBaseQuery = db.select().from(room)
      const countQuery = input.isActive !== undefined
        ? countBaseQuery.where(eq(room.isActive, input.isActive))
        : countBaseQuery
      
      const totalResult = await countQuery
      const total = totalResult.length
      
      return {
        rooms: result,
        pagination: {
          total,
          limit: input.limit,
          offset: input.offset,
          hasMore: input.offset + input.limit < total,
        },
      }
    }),

  // Get single room by ID
  get: publicProcedure
    .input(getRoomSchema)
    .query(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      const result = await db
        .select()
        .from(room)
        .where(eq(room.id, input.id))
      
      if (!result[0]) {
        throw new Error('Room not found')
      }
      
      return result[0]
    }),

  // Create new room (admin only - we'll add auth middleware later)
  create: publicProcedure
    .input(createRoomSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      const roomId = nanoid()
      const now = new Date()
      
      const newRoom = {
        id: roomId,
        slug: input.slug,
        basePrice: input.basePrice,
        isActive: input.isActive,
        airbnbIcalUrl: input.airbnbIcalUrl || null,
        bookingComIcalUrl: input.bookingComIcalUrl || null,
        lastAirbnbSync: null,
        lastBookingComSync: null,
        createdAt: now,
        updatedAt: now,
      }
      
      await db.insert(room).values(newRoom)
      
      return newRoom
    }),

  // Update existing room (admin only)
  update: publicProcedure
    .input(updateRoomSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      const { id, ...updateData } = input
      
      const result = await db
        .update(room)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(room.id, id))
        .returning()
      
      if (!result[0]) {
        throw new Error('Room not found')
      }
      
      return result[0]
    }),

  // Delete room (admin only)
  delete: publicProcedure
    .input(getRoomSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      const result = await db
        .delete(room)
        .where(eq(room.id, input.id))
        .returning()
      
      if (!result[0]) {
        throw new Error('Room not found')
      }
      
      return { success: true, id: input.id }
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
      }
    }),

  // Bulk availability check
  bulkAvailability: publicProcedure
    .input(bulkAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      // Build query conditions
      const conditions = [eq(room.isActive, true)]
      if (input.roomIds && input.roomIds.length > 0) {
        conditions.push(inArray(room.id, input.roomIds))
      }
      
      // Execute query with all conditions
      const roomsToCheck = await db
        .select()
        .from(room)
        .where(and(...conditions))
      
      // TODO: Check availability for each room
      const availability = roomsToCheck.map(roomData => ({
        roomId: roomData.id,
        roomSlug: roomData.slug,
        available: true, // Placeholder
        conflictingBookings: [],
        externalConflicts: [],
      }))
      
      return {
        dateRange: {
          startDate: input.startDate,
          endDate: input.endDate,
        },
        availability,
      }
    }),

  // Sync external calendar
  syncCalendar: publicProcedure
    .input(syncCalendarSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createDrizzle(ctx.db)
      
      // Get room to sync
      const result = await db
        .select()
        .from(room)
        .where(eq(room.id, input.roomId))
      
      if (!result[0]) {
        throw new Error('Room not found')
      }
      
      const roomData = result[0]
      
      // Get the appropriate calendar URL
      let calendarUrl: string | null = null
      if (input.platform === 'airbnb') {
        calendarUrl = roomData.airbnbIcalUrl
      } else if (input.platform === 'booking.com') {
        calendarUrl = roomData.bookingComIcalUrl
      }
      
      if (!calendarUrl) {
        throw new Error(`No ${input.platform} calendar URL configured for this room`)
      }
      
      // TODO: Implement calendar sync logic
      // This will fetch iCal data from external sources and parse it
      
      // Update last sync timestamp
      const updateField = input.platform === 'airbnb' ? 'lastAirbnbSync' : 'lastBookingComSync'
      const now = new Date()
      
      await db
        .update(room)
        .set({ [updateField]: now, updatedAt: now })
        .where(eq(room.id, input.roomId))
      
      return {
        success: true,
        syncedEvents: 0, // Placeholder
        lastSync: now,
        platform: input.platform,
      }
    }),
})