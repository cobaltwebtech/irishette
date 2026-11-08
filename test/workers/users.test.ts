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
		for (const field of ['id', 'banned', 'banReason', 'banExpires', 'image']) {
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

describe('users.updateProfile', () => {
	async function ownRow() {
		const [row] = await db()
			.select({ name: user.name, phoneNumber: user.phoneNumber })
			.from(user)
			.where(eq(user.id, GUEST.id));
		return row;
	}

	it('round-trips name and phone (trimmed), and null clears the phone', async () => {
		await caller('user').users.updateProfile({
			name: '  Guest Renamed ',
			phoneNumber: ' (555) 555-0142 ',
		});
		expect(await ownRow()).toEqual({
			name: 'Guest Renamed',
			phoneNumber: '(555) 555-0142',
		});

		// Omitted fields stay as they are.
		await caller('user').users.updateProfile({ name: 'Guest Again' });
		expect(await ownRow()).toEqual({
			name: 'Guest Again',
			phoneNumber: '(555) 555-0142',
		});

		await caller('user').users.updateProfile({ phoneNumber: null });
		expect((await ownRow()).phoneNumber).toBeNull();
	});

	it('a phone number used by another account is CONFLICT', async () => {
		await db()
			.update(user)
			.set({ phoneNumber: '5555550199' })
			.where(eq(user.id, OTHER_GUEST.id));
		const error = await trpcError(
			caller('user').users.updateProfile({ phoneNumber: '5555550199' }),
		);
		expect(error.code).toBe('CONFLICT');
	});

	it('rejects a phone with fewer than 10 digits or over 20 characters', async () => {
		for (const phoneNumber of ['555-0142', '+1 (555) 555-0142 x12345']) {
			const error = await trpcError(
				caller('user').users.updateProfile({ phoneNumber }),
			);
			expect(error.code).toBe('BAD_REQUEST');
		}
	});
});
