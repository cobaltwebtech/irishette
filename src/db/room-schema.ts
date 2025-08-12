import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
  index,
} from 'drizzle-orm/sqlite-core'

export const room = sqliteTable('room', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  basePrice: real('base_price').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),

  // iCal sync URLs for external platforms
  airbnbIcalUrl: text('airbnb_ical_url'),
  bookingComIcalUrl: text('booking_com_ical_url'),

  // Last sync timestamps for each platform
  lastAirbnbSync: integer('last_airbnb_sync', { mode: 'timestamp' }),
  lastBookingComSync: integer('last_booking_com_sync', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

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
    source: text('source').default('direct'), // direct, airbnb, booking.com, manual
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
)

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
})

// iCal sync log for debugging and monitoring
export const icalSyncLog = sqliteTable('ical_sync_log', {
  id: text('id').primaryKey(),
  roomId: text('room_id')
    .notNull()
    .references(() => room.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(), // airbnb, booking.com
  status: text('status').notNull(), // success, error, partial
  bookingsProcessed: integer('bookings_processed').default(0),
  errorMessage: text('error_message'),
  syncDuration: integer('sync_duration'), // milliseconds
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})
