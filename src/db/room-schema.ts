import { relations } from 'drizzle-orm';
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	unique,
} from 'drizzle-orm/sqlite-core';

export const room = sqliteTable('room', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	description: text('description'),
	basePrice: real('base_price').notNull(),
	serviceFeeRate: real('service_fee_rate').notNull().default(0.12), // 12% default service fee

	// Hotel Occupancy Tax rates (as decimals: 0.06 = 6%, 0.07 = 7%)
	stateTaxRate: real('state_tax_rate').notNull().default(0.06), // Texas state tax rate (6%)
	cityTaxRate: real('city_tax_rate').notNull().default(0.07), // Dublin city tax rate (7%)

	// Room status for lifecycle management
	// 'active' - Room is available for booking
	// 'inactive' - Room is temporarily unavailable (maintenance, etc.)
	// 'archived' - Room is permanently deactivated but kept for historical records
	status: text('status', { enum: ['active', 'inactive', 'archived'] })
		.default('active')
		.notNull(),

	// Legacy field - keep for backward compatibility during migration
	isActive: integer('is_active', { mode: 'boolean' }).default(true),

	// iCal sync URLs for external platforms
	airbnbIcalUrl: text('airbnb_ical_url'),
	expediaIcalUrl: text('expedia_ical_url'),

	// Last sync timestamps for each platform
	lastAirbnbSync: integer('last_airbnb_sync', { mode: 'timestamp' }),
	lastExpediaSync: integer('last_expedia_sync', { mode: 'timestamp' }),

	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});

// Enhanced availability tracking for iCal sync
export const roomAvailability = sqliteTable(
	'room_availability',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD

		// Availability status
		isAvailable: integer('is_available', { mode: 'boolean' }).default(true),
		isBlocked: integer('is_blocked', { mode: 'boolean' }).default(false),

		// Source tracking for sync conflicts
		source: text('source').default('direct'), // direct, airbnb, expedia, manual
		externalBookingId: text('external_booking_id'), // Reference to external platform booking

		// Price override for specific dates (seasonal pricing)
		priceOverride: real('price_override'),

		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		// Ensure only one availability record per room per date
		unique().on(table.roomId, table.date),
		index('room_availability_room_id_idx').on(table.roomId),
		index('room_availability_date_idx').on(table.date),
		index('room_availability_source_idx').on(table.source),
	],
);

// Keep manual blocking (maintenance, personal use, etc.)
export const roomBlockedPeriods = sqliteTable('room_blocked_periods', {
	id: text('id').primaryKey(),
	roomId: text('room_id')
		.notNull()
		.references(() => room.id, { onDelete: 'cascade' }),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	reason: text('reason').notNull(),
	notes: text('notes'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});

// iCal sync log for debugging and monitoring
export const icalSyncLog = sqliteTable('ical_sync_log', {
	id: text('id').primaryKey(),
	roomId: text('room_id')
		.notNull()
		.references(() => room.id, { onDelete: 'cascade' }),
	platform: text('platform').notNull(), // airbnb, expedia
	status: text('status').notNull(), // success, error, partial
	bookingsProcessed: integer('bookings_processed').default(0),
	errorMessage: text('error_message'),
	syncDuration: integer('sync_duration'), // milliseconds
	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});

// Room pricing rules for dynamic pricing management
export const roomPricingRules = sqliteTable(
	'room_pricing_rules',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),

		// Rule details
		name: text('name').notNull(), // e.g., "Summer Season", "Holiday Premium"
		ruleType: text('rule_type', {
			enum: ['surcharge_rate', 'fixed_amount', 'absolute_price'],
		}).notNull(),

		// For surcharge_rate: percentage (e.g., 0.20 for 20%)
		// For fixed_amount: dollar amount to add (e.g., 25.00)
		// For absolute_price: exact price per night (e.g., 150.00)
		value: real('value').notNull(),

		// Date range for rule application
		startDate: text('start_date').notNull(), // YYYY-MM-DD
		endDate: text('end_date').notNull(), // YYYY-MM-DD

		// Status for enabling/disabling rules
		isActive: integer('is_active', { mode: 'boolean' }).default(true),

		// Optional conditions
		daysOfWeek: text('days_of_week'), // JSON array: ["friday", "saturday"]

		// Metadata
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		index('room_pricing_rules_room_id_idx').on(table.roomId),
		index('room_pricing_rules_date_range_idx').on(
			table.startDate,
			table.endDate,
		),
		index('room_pricing_rules_active_idx').on(table.isActive),
	],
);

// Define relations for better query operations
export const roomRelations = relations(room, ({ many }) => ({
	availabilities: many(roomAvailability),
	blockedPeriods: many(roomBlockedPeriods),
	icalSyncLogs: many(icalSyncLog),
	pricingRules: many(roomPricingRules),
}));

export const roomAvailabilityRelations = relations(
	roomAvailability,
	({ one }) => ({
		room: one(room, {
			fields: [roomAvailability.roomId],
			references: [room.id],
		}),
	}),
);

export const roomBlockedPeriodsRelations = relations(
	roomBlockedPeriods,
	({ one }) => ({
		room: one(room, {
			fields: [roomBlockedPeriods.roomId],
			references: [room.id],
		}),
	}),
);

export const icalSyncLogRelations = relations(icalSyncLog, ({ one }) => ({
	room: one(room, {
		fields: [icalSyncLog.roomId],
		references: [room.id],
	}),
}));

export const roomPricingRulesRelations = relations(
	roomPricingRules,
	({ one }) => ({
		room: one(room, {
			fields: [roomPricingRules.roomId],
			references: [room.id],
		}),
	}),
);
