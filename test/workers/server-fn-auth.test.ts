import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { user } from '@/db/schema-export';
import {
	authorizeRequest,
	authorizeSession,
	ServerFnAuthError,
} from '@/lib/server-auth';

import { db, fakeSession } from './helpers';
import { ADMIN, GUEST } from './seed';

// The checks behind requireSessionMiddleware / requireAdminMiddleware
// (src/core/middleware/auth.ts). The middleware itself only resolves the
// Better Auth session from the request headers and sets the HTTP status.

async function rejection(promise: Promise<unknown>) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(ServerFnAuthError);
	return (error as ServerFnAuthError).status;
}

describe('authorizeSession (server function middleware)', () => {
	it('signed out is 401 at both levels', async () => {
		expect(await rejection(authorizeSession(null, 'user', db()))).toBe(401);
		expect(await rejection(authorizeSession(null, 'admin', db()))).toBe(401);
	});

	it('a banned user is 403', async () => {
		const session = fakeSession(GUEST, { banned: true, banExpires: null });
		expect(await rejection(authorizeSession(session, 'user', db()))).toBe(403);
	});

	it('returns only the SessionUser fields for a signed-in user', async () => {
		const result = await authorizeSession(fakeSession(GUEST), 'user', db());
		expect(result).toMatchObject({ id: GUEST.id, publicId: GUEST.publicId });
		for (const field of ['banned', 'banReason', 'banExpires', 'updatedAt']) {
			expect(result).not.toHaveProperty(field);
		}
	});

	it('admin level reads the role from D1, not the session', async () => {
		// A normal user whose (stale) session claims the admin role.
		const stale = fakeSession(GUEST, { role: 'admin' });
		expect(await rejection(authorizeSession(stale, 'admin', db()))).toBe(403);

		expect((await authorizeSession(fakeSession(ADMIN), 'admin', db())).id).toBe(
			ADMIN.id,
		);

		// Role revoked in D1 while the session still says admin.
		await db().update(user).set({ role: 'user' }).where(eq(user.id, ADMIN.id));
		expect(
			await rejection(authorizeSession(fakeSession(ADMIN), 'admin', db())),
		).toBe(403);
	});

	it('authorizeRequest resolves the session with Better Auth (no cookie: 401)', async () => {
		expect(await rejection(authorizeRequest(new Headers(), 'user'))).toBe(401);
		expect(await rejection(authorizeRequest(new Headers(), 'admin'))).toBe(401);
	});
});
