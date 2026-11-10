import { z } from 'zod';

import { phoneNumberSchema } from '@/lib/auth/user-validation';

/** Booking confirmation ids: 6 characters of A-Z (no I, O) and 0-9. */
const CONFIRMATION_ID_REGEX = /^[A-HJ-NP-Z0-9]{6}$/;

/** Empty or whitespace-only input → undefined (optional form fields). */
const blankToUndefined = (value: unknown) =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * The public contact form (src/routes/contact.tsx → submitContactFn).
 * Everything here is guest-typed and unverified.
 */
export const contactSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Please enter your name')
		.max(100, 'Name must be at most 100 characters'),
	email: z.email('Please enter a valid email address').max(254),
	phone: z.preprocess(blankToUndefined, phoneNumberSchema.optional()),
	subject: z
		.string()
		.trim()
		.min(1, 'Please enter a subject')
		.max(150, 'Subject must be at most 150 characters')
		// A single line: it becomes an email subject.
		.refine((value) => !/[\r\n]/.test(value), 'Subject must be one line'),
	message: z
		.string()
		.trim()
		.min(10, 'Message must be at least 10 characters')
		.max(5000, 'Message must be at most 5000 characters'),
	bookingConfirmationId: z.preprocess(
		(value) =>
			typeof value === 'string'
				? value.trim().toUpperCase() || undefined
				: value,
		z
			.string()
			.regex(CONFIRMATION_ID_REGEX, 'Confirmation ID looks like ABC123')
			.optional(),
	),
	turnstileToken: z
		.string()
		.min(1, 'Please complete the security check')
		.max(2048),
});

export type ContactInput = z.infer<typeof contactSchema>;
