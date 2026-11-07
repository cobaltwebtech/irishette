import { z } from 'zod';
import { isoDateSchema } from '@/lib/date-range';
import { publicIdSchema } from '@/lib/ids';

const checkOutAfterCheckIn = {
	message: 'Check-out must be after check-in',
	path: ['checkOutDate'],
};

// Booking request from the booking form. Prices are recomputed on the server;
// the client values below are accepted for compatibility and ignored.
const createBookingBaseSchema = z.object({
	roomId: z.string().min(1),
	checkInDate: isoDateSchema,
	checkOutDate: isoDateSchema,
	// Upper bound is the room's max_guests, checked on the server.
	guestCount: z.number().int().min(1).max(10),

	guestName: z.string().trim().min(2).max(100),
	guestEmail: z.email(),
	guestPhone: z.string().trim().min(10).max(20),
	specialRequests: z.string().max(1000).optional(),

	basePrice: z.number().nonnegative().optional(),
	serviceFee: z.number().nonnegative().optional(),
	taxAmount: z.number().nonnegative().optional(),
	totalAmount: z.number().nonnegative().optional(),
});

export const createBookingSchema = createBookingBaseSchema.refine(
	(d) => d.checkOutDate > d.checkInDate,
	checkOutAfterCheckIn,
);

export const calculateBookingSchema = z
	.object({
		roomId: z.string().min(1),
		checkInDate: isoDateSchema,
		checkOutDate: isoDateSchema,
		guestCount: z.number().int().min(1).max(10),
	})
	.refine((d) => d.checkOutDate > d.checkInDate, checkOutAfterCheckIn);

/** A booking the caller owns, by internal id (payment steps). */
export const bookingIdSchema = z.object({ bookingId: z.string().min(1) });

export const confirmPaymentSchema = z.object({
	bookingId: z.string().min(1),
	paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9_]+$/, 'Invalid payment id'),
});

export const bookingPublicIdSchema = z.object({ publicId: publicIdSchema });

export const cancelBookingSchema = z.object({
	publicId: publicIdSchema,
	reason: z.string().trim().max(500).optional(),
});

export const adminCancelBookingSchema = z.object({
	publicId: publicIdSchema,
	refund: z.enum(['full', 'policy', 'none']),
	reason: z.string().trim().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CalculateBookingInput = z.infer<typeof calculateBookingSchema>;
