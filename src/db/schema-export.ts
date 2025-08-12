// Re-export all schema tables for Drizzle
export * from './auth-schema'
export * from './booking-schema'
export * from './room-schema'

// Organized exports for better imports in your app
import * as authSchema from './auth-schema'
import * as bookingSchema from './booking-schema'
import * as roomSchema from './room-schema'

// Export organized schema groups
export const schemas = {
  auth: authSchema,
  booking: bookingSchema,
  room: roomSchema,
}

// Export all tables for database connection
export const allTables = {
  // Auth tables
  ...authSchema,
  // Booking tables
  ...bookingSchema,
  // Room tables
  ...roomSchema,
}
