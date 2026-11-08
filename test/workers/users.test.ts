import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { user } from '@/db/schema-export';

import { caller, db, trpcError } from './helpers';
import { GUEST, OTHER_GUEST } from './seed';

describe('users.adminGetGuestDetails', () => {
	it('returns explicit profile columns (no ban fields, no internal id)', async () => {
		const details = await caller('admin').users.adminGetGuestDetails({
			publicId: GUEST.publicId,
		});
		expect(details.user).toMatchObject({
			publicId: GUEST.publicId,
			email: GUEST.email,
			name: GUEST.name,
		});
		for (const field of [
			'id',
			'banned',
			'banReason',
			'banExpires',
			'phoneNumberVerified',
			'image',
		]) {
			expect(details.user).not.toHaveProperty(field);
		}
	});

	it('unknown guest is NOT_FOUND', async () => {
		const error = await trpcError(
			caller('admin').users.adminGetGuestDetails({
				publicId: 'unknownguest0001',
			}),
		);
		expect(error.code).toBe('NOT_FOUND');
	});
});

describe('users.updatePhoneNumber', () => {
	it('a phone number used by another account is CONFLICT', async () => {
		await db()
			.update(user)
			.set({ phoneNumber: '5555550199' })
			.where(eq(user.id, OTHER_GUEST.id));
		const error = await trpcError(
			caller('user').users.updatePhoneNumber({ phoneNumber: '5555550199' }),
		);
		expect(error.code).toBe('CONFLICT');
	});
});
