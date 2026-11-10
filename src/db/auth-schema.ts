import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { newId, newPublicId } from '@/utils/ids';

// Better Auth tables. Keep in sync with the Better Auth plugins in
// src/lib/auth/auth.ts (admin, stripe), user.additionalFields (publicId,
// phoneNumber) and the rateLimit option.
// Timestamps stay in seconds (mode: 'timestamp').

export const user = sqliteTable('user', {
	id: text('id').primaryKey().$defaultFn(newId),
	// Public id used in URLs (/admin/guest/$publicId). Declared to Better Auth
	// via user.additionalFields.publicId.
	publicId: text('public_id').notNull().unique().$defaultFn(newPublicId),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' })
		.$defaultFn(() => false)
		.notNull(),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	role: text('role'),
	banned: integer('banned', { mode: 'boolean' }),
	banReason: text('ban_reason'),
	banExpires: integer('ban_expires', { mode: 'timestamp' }),
	stripeCustomerId: text('stripe_customer_id'),
	// Optional, unique. Declared to Better Auth via user.additionalFields
	// (input: false); changed only through tRPC users.updateProfile.
	phoneNumber: text('phone_number').unique(),
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by'),
	},
	(table) => [index('session_userId_idx').on(table.userId)],
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', {
			mode: 'timestamp',
		}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {
			mode: 'timestamp',
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Better Auth rate limits (rateLimit.storage: 'database', src/lib/auth/auth.ts).
// One row per client IP + auth path. Better Auth prunes rows older than its
// longest window itself, so no cron cleanup is needed.
// Exception to the "timestamps in seconds" rule: `last_request` is Unix
// milliseconds because Better Auth writes and compares it as Date.now().
export const rateLimit = sqliteTable(
	'rate_limit',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		key: text('key').notNull().unique(),
		count: integer('count').notNull(),
		lastRequest: integer('last_request', { mode: 'number' }).notNull(),
	},
	(table) => [index('rate_limit_lastRequest_idx').on(table.lastRequest)],
);
