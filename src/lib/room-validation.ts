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
	serviceFeeRate: z
		.number()
		.min(0, 'Service fee rate must be positive')
		.max(1, 'Service fee rate cannot exceed 100%')
		.default(0.12),

	// Hotel Occupancy Tax rates (as decimals: 0.06 = 6%, 0.07 = 7%)
	stateTaxRate: z
		.number()
		.min(0, 'State tax rate must be positive')
		.max(1, 'State tax rate cannot exceed 100%')
		.default(0.06),
	cityTaxRate: z
		.number()
		.min(0, 'City tax rate must be positive')
		.max(1, 'City tax rate cannot exceed 100%')
		.default(0.07),

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

// Pricing rules schemas
export const pricingRuleTypeSchema = z.enum([
	'surcharge_rate',
	'fixed_amount',
	'absolute_price',
]);
export type PricingRuleType = z.infer<typeof pricingRuleTypeSchema>;

export const roomPricingRuleSchema = z
	.object({
		id: z.string().optional(),
		roomId: z.string(),
		name: z.string().min(1, 'Rule name is required'),
		ruleType: pricingRuleTypeSchema,
		value: z.number().min(0, 'Value must be positive'),
		startDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
		endDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
		isActive: z.boolean().default(true),
		daysOfWeek: z.string().optional(), // JSON stringified array
	})
	.refine(
		(data) => {
			// Ensure start date is before end date
			return new Date(data.startDate) < new Date(data.endDate);
		},
		{
			message: 'End date must be after start date',
			path: ['endDate'],
		},
	)
	.refine(
		(data) => {
			// Validate value based on rule type
			if (data.ruleType === 'surcharge_rate') {
				// Surcharge rate should be between 0 and 5 (0% to 500%)
				return data.value >= 0 && data.value <= 5;
			}
			return true;
		},
		{
			message: 'Surcharge rate must be between 0 and 5 (0% to 500%)',
			path: ['value'],
		},
	);

// Create pricing rule input (without ID and timestamps)
export const createPricingRuleSchema = roomPricingRuleSchema.omit({
	id: true,
});

// Update pricing rule input (partial with required ID)
export const updatePricingRuleSchema = roomPricingRuleSchema.partial().extend({
	id: z.string(),
});

// Query schemas for pricing rules
export const getPricingRulesSchema = z.object({
	roomId: z.string(),
	isActive: z.boolean().optional(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
		.optional(),
});

export const deletePricingRuleSchema = z.object({
	id: z.string(),
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
export type RoomPricingRule = z.infer<typeof roomPricingRuleSchema>;
export type CreatePricingRule = z.infer<typeof createPricingRuleSchema>;
export type UpdatePricingRule = z.infer<typeof updatePricingRuleSchema>;
export type GetPricingRules = z.infer<typeof getPricingRulesSchema>;
