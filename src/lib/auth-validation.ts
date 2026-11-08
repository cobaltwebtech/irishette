import { z } from 'zod';

// Password schema with validation rules
export const passwordSchema = z.object({
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(100, 'Password must be less than 100 characters')
		.regex(
			/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
			'Password must contain at least one uppercase letter, one lowercase letter, and one number',
		),
});

// Email schema
export const emailSchema = z.object({
	email: z.email('Please enter a valid email address'),
});

// Registration schema
export const registerSchema = z
	.object({
		email: z.email('Please enter a valid email address'),
		password: z.string().min(8, 'Password must be at least 8 characters'),
		confirmPassword: z.string(),
		name: z.string().min(2, 'Name must be at least 2 characters').optional(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	});
