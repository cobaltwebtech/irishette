import { eq } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import { user } from '@/db/schema-export';

// Access checks shared by the tRPC procedures. Server-only.
//
// The session comes from Better Auth's cookie cache, which can be up to
// 5 minutes old. Ban checks on the session are free; admin checks re-read the
// user row so a revoked role or a new ban takes effect on the next call.

interface BanFields {
	banned?: boolean | null;
	banExpires?: Date | string | null;
}

/** True while a ban is in force (a ban with a past `banExpires` has lapsed). */
export function isBanActive(fields: BanFields, now = new Date()): boolean {
	if (!fields.banned) return false;
	if (!fields.banExpires) return true;
	return new Date(fields.banExpires).getTime() > now.getTime();
}

/** Admin role and no active ban, read from D1 (one primary-key lookup). */
export async function isActiveAdmin(
	db: Database,
	userId: string,
): Promise<boolean> {
	const [row] = await db
		.select({
			role: user.role,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.id, userId));
	return row?.role === 'admin' && !isBanActive(row);
}
