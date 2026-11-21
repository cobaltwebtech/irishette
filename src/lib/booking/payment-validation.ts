import { z } from 'zod';

import { phoneNumberSchema } from '@/lib/auth/user-validation';
import { arrivalWindowSchema } from '@/lib/booking/arrival-windows';
import { isoDateSchema } from '@/utils/date-range';
import { publicIdSchema } from '@/utils/ids';

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
	guestPhone: phoneNumberSchema,
	specialRequests: z.string().max(1000).optional(),
	estimatedArrival: arrivalWindowSchema,

	basePrice: z.number().nonnegative().optional(),
	serviceFee: z.number().nonnegative().optional(),
	taxAmount: z.number().nonnegative().optional(),
	totalAmount: z.number().nonnegative().optional(),
});

/** The guest details form (client) uses the same rules as the server. */
export const guestDetailsSchema = createBookingBaseSchema.pick({
	guestName: true,
	guestEmail: true,
	guestPhone: true,
	guestCount: true,
	specialRequests: true,
	estimatedArrival: true,
});

/** How an admin booking is paid: a card (Stripe) or outside Stripe. */
export const adminPaymentMethodSchema = z.enum(['card', 'offline']);
export type AdminPaymentMethod = z.infer<typeof adminPaymentMethodSchema>;

/**
 * An admin booking taken by phone (plan 06): the guest's details, no client
 * prices, the admin's internal notes, the late same-day acknowledgement and
 * how it is paid. A card payment needs the guest's verbal consent to keep
 * the card on file; a payment taken outside Stripe (Cash/Check/Other) does
 * not.
 */
export const adminCreateBookingSchema = createBookingBaseSchema
	.omit({
		basePrice: true,
		serviceFee: true,
		taxAmount: true,
		totalAmount: true,
	})
	.extend({
		internalNotes: z.string().trim().max(5000).optional(),
		acknowledgeLateBooking: z.boolean().optional(),
		paymentMethod: adminPaymentMethodSchema.default('card'),
		cardConsent: z.boolean().optional(),
	})
	.refine((d) => d.checkOutDate > d.checkInDate, checkOutAfterCheckIn)
	.refine((d) => d.paymentMethod !== 'card' || d.cardConsent === true, {
		message: 'Confirm the guest agreed to keep the card on file',
		path: ['cardConsent'],
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

/** The return page's fast-path confirmation (?session_id=cs_...). */
export const confirmCheckoutSchema = z.object({
	publicId: publicIdSchema,
	sessionId: z
		.string()
		.max(255)
		.regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Invalid checkout session id'),
});

export const bookingPublicIdSchema = z.object({ publicId: publicIdSchema });

/** The refund the dialog showed; a different server amount is CONFLICT. */
const expectedRefundAmount = z.number().nonnegative().max(1_000_000).optional();

export const cancelBookingSchema = z.object({
	publicId: publicIdSchema,
	reason: z.string().trim().max(500).optional(),
	expectedRefundAmount,
});

export const adminCancelBookingSchema = z.object({
	publicId: publicIdSchema,
	refund: z.enum(['full', 'policy', 'none']),
	reason: z.string().trim().max(500).optional(),
	/** Refund although the payment has an open dispute (plan 02, B7). */
	confirmDisputeRefund: z.boolean().optional(),
	expectedRefundAmount,
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type AdminCreateBookingInput = z.infer<typeof adminCreateBookingSchema>;
