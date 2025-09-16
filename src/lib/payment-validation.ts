import { z } from 'zod';

// Base booking schema matching the database schema
export const createBookingSchema = z.object({
	roomId: z.string(),
	checkInDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	checkOutDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
	guestCount: z.number().int().min(1).max(20),

	// Guest information
	guestName: z.string().min(2).max(100),
	guestEmail: z.string().email(),
	guestPhone: z.string().min(10).max(20),

	// Billing address
	billingAddress: z.object({
		line1: z.string().min(1).max(200),
		line2: z.string().max(200).optional(),
		city: z.string().min(1).max(100),
		state: z.string().min(1).max(100),
		postalCode: z.string().min(1).max(20),
		country: z.string().length(2), // ISO country code
	}),

	// Special requests and notes
	specialRequests: z.string().max(1000).optional(),

	// Pricing breakdown
	basePrice: z.number().positive(),
	cleaningFee: z.number().min(0).optional(),
	serviceFee: z.number().min(0).optional(),
	taxAmount: z.number().min(0).optional(),
	totalAmount: z.number().positive(),
});

// Stripe checkout session creation schema
export const createCheckoutSessionSchema = z.object({
	bookingId: z.string(), // Temporary booking ID
	successUrl: z.string().url(),
	cancelUrl: z.string().url(),
});

// Update booking schema for modifications
export const updateBookingSchema = z.object({
	bookingId: z.string(),
	status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
	specialRequests: z.string().max(1000).optional(),
});

// Cancel booking schema
export const cancelBookingSchema = z.object({
	bookingId: z.string(),
	reason: z.string().max(500).optional(),
});

// Get bookings schema with filters
export const getBookingsSchema = z.object({
	userId: z.string().optional(),
	roomId: z.string().optional(),
	status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	limit: z.number().int().min(1).max(100).default(10),
	offset: z.number().int().min(0).default(0),
});

// Booking calculation schema
export const calculateBookingSchema = z.object({
	roomId: z.string(),
	checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	guestCount: z.number().int().min(1).max(20),
});

// Webhook validation schema
export const stripeWebhookSchema = z.object({
	type: z.string(),
	data: z.object({
		object: z.record(z.string(), z.any()),
	}),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateCheckoutSessionInput = z.infer<
	typeof createCheckoutSessionSchema
>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type GetBookingsInput = z.infer<typeof getBookingsSchema>;
export type CalculateBookingInput = z.infer<typeof calculateBookingSchema>;
export type StripeWebhookInput = z.infer<typeof stripeWebhookSchema>;
