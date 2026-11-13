import { and, eq, isNull, or } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import { notificationPreferences, user } from '@/db/schema-export';
import type { NotificationCategory } from '@/lib/email/notification-categories';

/**
 * Email addresses of the admins (role = 'admin') who get email for
 * `category`: everyone except admins who turned it off in /admin/settings
 * (no stored preference = on). Never log them.
 */
export async function getAdminEmails(
	db: Database,
	category: NotificationCategory,
): Promise<string[]> {
	const admins = await db
		.select({ email: user.email })
		.from(user)
		.leftJoin(
			notificationPreferences,
			and(
				eq(notificationPreferences.userId, user.id),
				eq(notificationPreferences.category, category),
			),
		)
		.where(
			and(
				eq(user.role, 'admin'),
				or(
					isNull(notificationPreferences.id),
					eq(notificationPreferences.emailEnabled, true),
				),
			),
		);
	return admins.map((a) => a.email);
}
