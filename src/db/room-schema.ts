import { relations } from 'drizzle-orm';
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { newIcalExportToken, newId, newPublicId } from '../lib/ids';

export const room = sqliteTable('room', {
	id: text('id').primaryKey().$defaultFn(newId),
	// Public id used in URLs (/admin/property-management/$publicId).
	publicId: text('public_id').notNull().unique().$defaultFn(newPublicId),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	description: text('description'),
	basePrice: real('base_price').notNull(),
	serviceFeeRate: real('service_fee_rate').notNull().default(0.12), // 12% default service fee

	// Hotel Occupancy Tax rates (as decimals: 0.06 = 6%, 0.07 = 7%)
	stateTaxRate: real('state_tax_rate').notNull().default(0.06), // Texas state tax rate (6%)
	cityTaxRate: real('city_tax_rate').notNull().default(0.07), // Dublin city tax rate (7%)

	// Maximum number of guests per booking. Admin-editable.
	maxGuests: integer('max_guests').notNull().default(2),

	// Secret token in the iCal export URL. Never returned by public procedures.
	icalExportToken: text('ical_export_token')
		.notNull()
		.unique()
		.$defaultFn(newIcalExportToken),

	// Room status for lifecycle management
	// 'active' - Room is available for booking
	// 'inactive' - Room is temporarily unavailable (maintenance, etc.)
	// 'archived' - Room is permanently deactivated but kept for historical records
	status: text('status', { enum: ['active', 'inactive', 'archived'] })
		.default('active')
		.notNull(),

	// Legacy field - keep for backward compatibility during migration
	isActive: integer('is_active', { mode: 'boolean' }).default(true),

	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});

// Imported iCal feeds (Airbnb, Expedia, Vrbo, Booking.com, ...). Adding a
// platform is a new row, not a code change. `url` is a third-party secret:
// never return it from public procedures.
export const icalFeedSources = [
	'airbnb',
	'expedia',
	'vrbo',
	'booking',
	'other',
] as const;
export type IcalFeedSource = (typeof icalFeedSources)[number];

export const icalFeeds = sqliteTable(
	'ical_feeds',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),
		source: text('source', { enum: icalFeedSources }).notNull(),
		label: text('label'),
		url: text('url').notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

		// Conditional GET state
		etag: text('etag'),
		lastModified: text('last_modified'),

		// Sync status
		lastSuccessAt: integer('last_success_at', { mode: 'timestamp' }),
		lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
		lastEventCount: integer('last_event_count'),
		lastError: text('last_error'),

		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex('ical_feeds_room_url_unique').on(table.roomId, table.url),
		index('ical_feeds_room_id_idx').on(table.roomId),
	],
);

// Events imported from iCal feeds. Dates are YYYY-MM-DD; end_date is
// EXCLUSIVE (iCal DTEND semantics).
export const externalEventKinds = ['reserved', 'unavailable'] as const;
export type ExternalEventKind = (typeof externalEventKinds)[number];

export const externalEvents = sqliteTable(
	'external_events',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		feedId: text('feed_id')
			.notNull()
			.references(() => icalFeeds.id, { onDelete: 'cascade' }),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),
		uid: text('uid').notNull(),
		startDate: text('start_date').notNull(), // YYYY-MM-DD, inclusive
		endDate: text('end_date').notNull(), // YYYY-MM-DD, exclusive
		kind: text('kind', { enum: externalEventKinds })
			.notNull()
			.default('reserved'),
		summary: text('summary'),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex('external_events_feed_uid_unique').on(table.feedId, table.uid),
		index('external_events_room_dates_idx').on(
			table.roomId,
			table.startDate,
			table.endDate,
		),
	],
);

// Keep manual blocking (maintenance, personal use, etc.). Inclusive dates.
export const roomBlockedPeriods = sqliteTable('room_blocked_periods', {
	id: text('id').primaryKey().$defaultFn(newId),
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
	id: text('id').primaryKey().$defaultFn(newId),
	roomId: text('room_id')
		.notNull()
		.references(() => room.id, { onDelete: 'cascade' }),
	platform: text('platform').notNull(), // feed source: airbnb, expedia, ...
	status: text('status').notNull(), // success, error, partial
	bookingsProcessed: integer('bookings_processed').default(0),
	errorMessage: text('error_message'),
	syncDuration: integer('sync_duration'), // milliseconds
	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});

// Room pricing rules for dynamic pricing management.
// Inclusive start/end dates; active rules in a room must not overlap.
export const roomPricingRules = sqliteTable(
	'room_pricing_rules',
	{
		id: text('id').primaryKey().$defaultFn(newId),
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

		// Date range for rule application (inclusive)
		startDate: text('start_date').notNull(), // YYYY-MM-DD
		endDate: text('end_date').notNull(), // YYYY-MM-DD

		// Status for enabling/disabling rules
		isActive: integer('is_active', { mode: 'boolean' }).default(true),
		// Set when created active or reactivated; earliest wins on legacy overlap.
		activatedAt: integer('activated_at', { mode: 'timestamp' }),

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
		index('room_pricing_rules_room_active_dates_idx').on(
			table.roomId,
			table.isActive,
			table.startDate,
			table.endDate,
		),
	],
);

// Define relations for better query operations
export const roomRelations = relations(room, ({ many }) => ({
	icalFeeds: many(icalFeeds),
	externalEvents: many(externalEvents),
	blockedPeriods: many(roomBlockedPeriods),
	icalSyncLogs: many(icalSyncLog),
	pricingRules: many(roomPricingRules),
}));

export const icalFeedsRelations = relations(icalFeeds, ({ one, many }) => ({
	room: one(room, {
		fields: [icalFeeds.roomId],
		references: [room.id],
	}),
	events: many(externalEvents),
}));

export const externalEventsRelations = relations(externalEvents, ({ one }) => ({
	feed: one(icalFeeds, {
		fields: [externalEvents.feedId],
		references: [icalFeeds.id],
	}),
	room: one(room, {
		fields: [externalEvents.roomId],
		references: [room.id],
	}),
}));

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
