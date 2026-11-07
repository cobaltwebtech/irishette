import { eq } from 'drizzle-orm';
import type { Database } from '@/db/drizzle-init';
import { user } from '@/db/schema-export';

/** Email addresses of all admin users (role = 'admin'). Never log them. */
export async function getAdminEmails(db: Database): Promise<string[]> {
	const admins = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.role, 'admin'));
	return admins.map((a) => a.email);
}
