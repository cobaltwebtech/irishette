import { z } from 'zod';

// Base booking schema matching the database schema
export const bookingSchema = z.object({
	id: z.string().optional(),
	confirmationId: z.string().optional(),
	userId: z.string(),
	roomId: z.string(),
	checkInDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	checkOutDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	numberOfNights: z.number().min(1).optional(),
	numberOfGuests: z.number().min(1, 'At least 1 guest required'),

	// Pricing
	baseAmount: z.number().min(0, 'Base amount must be positive'),
	taxAmount: z.number().min(0).default(0),
	feesAmount: z.number().min(0).default(0),
	discountAmount: z.number().min(0).default(0),
	totalAmount: z.number().min(0, 'Total amount must be positive'),

	// Status
	status: z.enum(['pending', 'confirmed', 'cancelled']).default('pending'),
	paymentStatus: z.enum(['pending', 'paid', 'refunded']).default('pending'),

	// Guest info
	guestName: z.string().min(1, 'Guest name is required'),
	guestEmail: z.string().email('Valid email is required'),
	guestPhone: z.string().optional(),

	// Additional info
	specialRequests: z.string().optional(),
	internalNotes: z.string().optional(),
	stripeCustomerId: z.string().optional(),
});

// Create booking input
export const createBookingSchema = bookingSchema.omit({
	id: true,
	confirmationId: true,
	numberOfNights: true,
});

// Update booking input
export const updateBookingSchema = bookingSchema.partial().extend({
	id: z.string(),
});

// Get booking input
export const getBookingSchema = z.object({
	id: z.string(),
});

// Get bookings with filtering and pagination
export const getBookingsSchema = z.object({
	limit: z.number().min(1).max(100).default(10),
	offset: z.number().min(0).default(0),
	status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
	paymentStatus: z.enum(['pending', 'paid', 'refunded']).optional(),
	roomId: z.string().optional(),
	userId: z.string().optional(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
		.optional(),
	sortBy: z.enum(['createdAt', 'checkInDate']).default('createdAt'),
	sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Cancel booking input
export const cancelBookingSchema = z.object({
	id: z.string(),
	reason: z.string().optional(),
});

// Update payment status input
export const updatePaymentStatusSchema = z.object({
	id: z.string(),
	paymentStatus: z.enum(['pending', 'paid', 'refunded']),
});

// Payment transaction schema
export const paymentTransactionSchema = z.object({
	id: z.string().optional(),
	bookingId: z.string(),
	stripePaymentIntentId: z.string().optional(),
	stripeCustomerId: z.string().optional(),
	amount: z.number().min(0),
	status: z.enum(['pending', 'succeeded', 'failed', 'refunded']),
	paymentMethod: z.string().optional(),
});

// Create payment transaction input
export const createPaymentTransactionSchema = paymentTransactionSchema.omit({
	id: true,
});

// Export types
export type Booking = z.infer<typeof bookingSchema>;
export type CreateBooking = z.infer<typeof createBookingSchema>;
export type UpdateBooking = z.infer<typeof updateBookingSchema>;
export type GetBookingsQuery = z.infer<typeof getBookingsSchema>;
export type CancelBooking = z.infer<typeof cancelBookingSchema>;
export type PaymentTransaction = z.infer<typeof paymentTransactionSchema>;
export type CreatePaymentTransaction = z.infer<
	typeof createPaymentTransactionSchema
>;
