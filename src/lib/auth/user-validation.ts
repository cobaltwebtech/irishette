import { z } from 'zod';

import { notificationCategories } from '@/lib/email/notification-categories';

/** Minimum number of digits in a phone number (formatting characters aside). */
const PHONE_MIN_DIGITS = 10;

/**
 * Phone number for profiles and bookings (one schema everywhere): trimmed,
 * at most 20 characters, at least 10 digits. Formatting is kept as typed.
 */
export const phoneNumberSchema = z
	.string()
	.trim()
	.max(20, 'Phone number must be at most 20 characters')
	.refine((value) => value.replace(/\D/g, '').length >= PHONE_MIN_DIGITS, {
		message: `Phone number must have at least ${PHONE_MIN_DIGITS} digits`,
	});

/**
 * `users.updateProfile`: the caller's own name and phone number. Omitted
 * fields stay as they are; `phoneNumber: null` removes the number. Email
 * changes go through Better Auth's changeEmail (verified by email).
 */
export const updateProfileSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(100).optional(),
	phoneNumber: phoneNumberSchema.nullable().optional(),
});

/**
 * `users.adminUpdateNotificationPreferences`: email on (true) or off (false)
 * per category. Categories left out keep their current setting.
 */
export const updateNotificationPreferencesSchema = z.object({
	preferences: z.partialRecord(z.enum(notificationCategories), z.boolean()),
});
