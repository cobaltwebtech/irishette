import { z } from 'zod';

import { isoDateSchema } from '@/utils/date-range';
import { publicIdSchema } from '@/utils/ids';

// Admin reservation changes (plan 06): tRPC inputs. Shared (the admin modify
// page builds the same shapes).

const note = z.string().trim().max(500).optional();

/** The stay after the change (room by internal id, as in createBooking). */
export const modificationTargetSchema = z
	.object({
		publicId: publicIdSchema,
		roomId: z.string().min(1),
		checkInDate: isoDateSchema,
		checkOutDate: isoDateSchema,
	})
	.refine((d) => d.checkOutDate > d.checkInDate, {
		message: 'Check-out must be after check-in',
		path: ['checkOutDate'],
	});

export const adminModifyBookingSchema = modificationTargetSchema.and(
	z.object({
		/** The signed difference the admin approved (drift check). */
		expectedDifferenceCents: z.number().int().min(-10_000_000).max(10_000_000),
		note,
		confirmDisputeRefund: z.boolean().optional(),
	}),
);

export const adminReleaseEarlySchema = z.object({
	publicId: publicIdSchema,
	newCheckOutDate: isoDateSchema,
	note,
});

export const adminConfirmModificationSchema = z.object({
	publicId: publicIdSchema,
	sessionId: z
		.string()
		.max(255)
		.regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Invalid checkout session id'),
	note,
});
