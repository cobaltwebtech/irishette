import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import { user } from '@/db/schema-export';
import { auth } from '@/lib/auth/auth';
import { isUniqueViolation } from '@/utils/db-errors';

// Admin bookings taken by phone (plan 06): the guest's account is found by
// email, or created without a sign-in step. A later magic-link sign-in
// verifies the address and shows the guest their booking.

const guestColumns = {
	id: user.id,
	publicId: user.publicId,
	name: user.name,
	email: user.email,
	phoneNumber: user.phoneNumber,
	banned: user.banned,
};

/** The account with this email (emails are stored lowercase), if any. */
export async function findGuestByEmail(db: Database, email: string) {
	const [row] = await db
		.select(guestColumns)
		.from(user)
		.where(eq(user.email, email.trim().toLowerCase()));
	return row ?? null;
}

/**
 * The guest account for an admin booking: the existing user with this email
 * (refused if banned), or a new one created through Better Auth's admin API
 * (so the id, publicId and Stripe customer hooks run; email not verified).
 * Fills an empty name, and the phone number when the account has none and
 * no other account uses it (the booking keeps the phone either way).
 */
export async function findOrCreateGuest(
	db: Database,
	details: { email: string; name: string; phone?: string | null },
): Promise<{ userId: string; created: boolean }> {
	const email = details.email.trim().toLowerCase();
	let guest = await findGuestByEmail(db, email);
	let created = false;
	if (guest?.banned) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'This guest account is banned and cannot be booked.',
		});
	}
	if (!guest) {
		// No headers: a server-side call (adminProcedure already checked the
		// caller). Better Auth then skips its own session check.
		const authInstance = await auth();
		await authInstance.api.createUser({
			body: { email, name: details.name.trim(), role: 'user' },
		});
		guest = await findGuestByEmail(db, email);
		if (!guest) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'The guest account could not be created.',
			});
		}
		created = true;
	}
	await fillProfile(db, guest, details);
	return { userId: guest.id, created };
}

async function fillProfile(
	db: Database,
	guest: { id: string; name: string; phoneNumber: string | null },
	details: { name: string; phone?: string | null },
) {
	if (!guest.name.trim() && details.name.trim()) {
		await db
			.update(user)
			.set({ name: details.name.trim(), updatedAt: new Date() })
			.where(eq(user.id, guest.id));
	}
	if (guest.phoneNumber || !details.phone) return;
	try {
		await db
			.update(user)
			.set({ phoneNumber: details.phone, updatedAt: new Date() })
			.where(eq(user.id, guest.id));
	} catch (error) {
		// Another account has this number: keep it on the booking only.
		if (!isUniqueViolation(error)) throw error;
	}
}
