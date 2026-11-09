import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { user } from '@/db/schema-export';

import { caller, db, insertBooking, trpcError } from './helpers';
import { ADMIN, OTHER_GUEST } from './seed';

// The session (Better Auth cookie cache) can be up to 5 minutes old. Admin
// procedures re-read role and ban status from D1; signed-in procedures reject
// a session whose user is banned.

async function setAdminRow(values: { role?: string; banned?: boolean }) {
	await db().update(user).set(values).where(eq(user.id, ADMIN.id));
}

describe('adminProcedure reads role and ban from D1', () => {
	it('allows a current admin', async () => {
		await expect(
			caller('admin').bookings.adminListBookings({}),
		).resolves.toBeInstanceOf(Array);
	});

	it('rejects a stale admin session when D1 says user', async () => {
		// GUEST is a 'user' in D1, but the (cached) session still says admin.
		const error = await trpcError(
			caller('user', { role: 'admin' }).bookings.adminListBookings({}),
		);
		expect(error.code).toBe('FORBIDDEN');
	});

	it('rejects an admin whose role was revoked in D1', async () => {
		await setAdminRow({ role: 'user' });
		try {
			const error = await trpcError(
				caller('admin').bookings.adminListBookings({}),
			);
			expect(error.code).toBe('FORBIDDEN');
		} finally {
			await setAdminRow({ role: 'admin' });
		}
	});

	it('rejects an admin who was banned in D1', async () => {
		await setAdminRow({ banned: true });
		try {
			const error = await trpcError(
				caller('admin').bookings.adminListBookings({}),
			);
			expect(error.code).toBe('FORBIDDEN');
		} finally {
			await setAdminRow({ banned: false });
		}
	});

	it('does not let a stale admin session read another guest’s booking', async () => {
		const booking = await insertBooking({ userId: OTHER_GUEST.id });
		const error = await trpcError(
			caller('user', { role: 'admin' }).bookings.getCancellationQuote({
				publicId: booking.publicId,
			}),
		);
		expect(error.code).toBe('NOT_FOUND');
	});
});

describe('protectedProcedure rejects banned users', () => {
	it('rejects a banned session', async () => {
		const error = await trpcError(
			caller('user', { banned: true }).bookings.getMyBookings({}),
		);
		expect(error.code).toBe('FORBIDDEN');
	});

	it('allows a session whose ban has expired', async () => {
		await expect(
			caller('user', {
				banned: true,
				banExpires: new Date(Date.now() - 60_000),
			}).bookings.getMyBookings({}),
		).resolves.toBeInstanceOf(Array);
	});
});
