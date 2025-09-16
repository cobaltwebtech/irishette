import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';
import { room } from './room-schema';

// Main booking/reservation table
export const bookings = sqliteTable(
	'bookings',
	{
		id: text('id').primaryKey(),
		confirmationId: text('confirmation_id').notNull().unique(),

		// Relationships
		userId: text('user_id') // Better Auth user ID
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),

		// Core booking data
		checkInDate: text('check_in_date').notNull(),
		checkOutDate: text('check_out_date').notNull(),
		numberOfNights: integer('number_of_nights').notNull(),
		numberOfGuests: integer('number_of_guests').notNull(),

		// Detailed pricing breakdown (for accounting)
		baseAmount: real('base_amount').notNull(),
		taxAmount: real('tax_amount').default(0),
		feesAmount: real('fees_amount').default(0),
		discountAmount: real('discount_amount').default(0),
		totalAmount: real('total_amount').notNull(),

		// Essential status tracking
		status: text('status').notNull().default('pending'), // pending, confirmed, cancelled
		paymentStatus: text('payment_status').notNull().default('pending'), // pending, paid, refunded

		// Guest contact (essential for communication)
		guestName: text('guest_name').notNull(),
		guestEmail: text('guest_email').notNull(),
		guestPhone: text('guest_phone'),

		// Admin and customer service
		specialRequests: text('special_requests'),
		internalNotes: text('internal_notes'), // Admin-only notes

		// Stripe integration
		stripeCustomerId: text('stripe_customer_id'),
		stripeSessionId: text('stripe_session_id'),
		stripePaymentIntentId: text('stripe_payment_intent_id'),

		// Timestamps (essential for admin dashboard)
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
	},
	(table) => [
		index('bookings_room_id_idx').on(table.roomId),
		index('bookings_status_idx').on(table.status),
		index('bookings_check_in_date_idx').on(table.checkInDate),
		index('bookings_created_at_idx').on(table.createdAt),
	],
);

// Keep simplified payment tracking
export const paymentTransactions = sqliteTable('payment_transactions', {
	id: text('id').primaryKey(),
	bookingId: text('booking_id')
		.notNull()
		.references(() => bookings.id, { onDelete: 'cascade' }),

	// Essential Stripe data
	stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
	stripeCustomerId: text('stripe_customer_id'), // For customer tracking
	amount: real('amount').notNull(),
	status: text('status').notNull(), // pending, succeeded, failed, refunded

	// Payment method info (useful for admin)
	paymentMethod: text('payment_method'), // card, bank_transfer, etc.

	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
});
