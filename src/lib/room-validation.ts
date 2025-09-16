import { z } from 'zod';

// Room status enum
export const roomStatusSchema = z.enum(['active', 'inactive', 'archived']);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

// Base room schema matching the database schema
export const roomSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1, 'Room name is required'),
	slug: z.string().min(1, 'Room slug is required'),
	description: z.string().optional(),
	basePrice: z.number().min(0, 'Price must be positive'),
	status: roomStatusSchema.default('active'),

	// Legacy field - keep for backward compatibility
	isActive: z.boolean().default(true),

	// iCal sync URLs for external platforms
	airbnbIcalUrl: z.string().url().optional(),
	expediaIcalUrl: z.string().url().optional(),

	// Last sync timestamps (handled by system, not input)
	lastAirbnbSync: z.date().optional(),
	lastExpediaSync: z.date().optional(),
});

// Create room input (without ID and timestamps)
export const createRoomSchema = roomSchema.omit({
	id: true,
	lastAirbnbSync: true,
	lastExpediaSync: true,
});

// Update room input (partial with required ID)
export const updateRoomSchema = roomSchema
	.partial()
	.extend({
		id: z.string(),
	})
	.omit({
		lastAirbnbSync: true,
		lastExpediaSync: true,
	});

// Room query schemas
export const getRoomSchema = z.object({
	id: z.string(),
});

export const getRoomsSchema = z.object({
	limit: z.number().min(1).max(100).default(10),
	offset: z.number().min(0).default(0),
	status: roomStatusSchema.optional(), // Filter by status instead of just isActive
	isActive: z.boolean().optional(), // Keep for backward compatibility
});

// Availability checking schemas
export const checkAvailabilitySchema = z.object({
	roomId: z.string(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

export const bulkAvailabilitySchema = z.object({
	roomIds: z.array(z.string()).optional(), // If not provided, check all rooms
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Calendar sync schema
export const syncCalendarSchema = z.object({
	roomId: z.string(),
	platform: z.enum(['airbnb', 'expedia']),
});

// Room availability schema
export const roomAvailabilitySchema = z.object({
	id: z.string().optional(),
	roomId: z.string(),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	isAvailable: z.boolean().default(true),
	isBlocked: z.boolean().default(false),
	source: z.enum(['direct', 'airbnb', 'expedia', 'manual']).default('direct'),
	externalBookingId: z.string().optional(),
	priceOverride: z.number().min(0).optional(),
});

// Room blocking schema
export const blockRoomSchema = z.object({
	roomId: z.string(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	reason: z.string().min(1, 'Reason is required'),
	notes: z.string().optional(),
});

// Export types
export type Room = z.infer<typeof roomSchema>;
export type CreateRoom = z.infer<typeof createRoomSchema>;
export type UpdateRoom = z.infer<typeof updateRoomSchema>;
export type GetRoomsQuery = z.infer<typeof getRoomsSchema>;
export type CheckAvailability = z.infer<typeof checkAvailabilitySchema>;
export type BulkAvailability = z.infer<typeof bulkAvailabilitySchema>;
export type SyncCalendar = z.infer<typeof syncCalendarSchema>;
export type RoomAvailability = z.infer<typeof roomAvailabilitySchema>;
export type BlockRoom = z.infer<typeof blockRoomSchema>;
