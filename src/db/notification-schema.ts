import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { notificationCategories } from '@/lib/email/notification-categories';
import { newId } from '@/utils/ids';

import { user } from './auth-schema';

// An admin's email choice for one notification category
// (src/lib/email/notification-categories.ts). No row means the default:
// email on. Read when admin emails pick their recipients
// (src/lib/server/admin-query.ts getAdminEmails); written from /admin/settings
// (tRPC users.adminUpdateNotificationPreferences).
export const notificationPreferences = sqliteTable(
	'notification_preferences',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		category: text('category', { enum: notificationCategories }).notNull(),
		emailEnabled: integer('email_enabled', { mode: 'boolean' })
			.notNull()
			.default(true),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex('notification_preferences_user_category_unique').on(
			table.userId,
			table.category,
		),
	],
);
