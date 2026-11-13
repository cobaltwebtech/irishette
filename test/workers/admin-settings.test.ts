import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vite-plus/test';

import { account, notificationPreferences, user } from '@/db/schema-export';
import { sendAdminAlert } from '@/lib/email/email-service';
import { notificationCategories } from '@/lib/email/notification-categories';
import { getAdminEmails } from '@/lib/server/admin-query';
import { newId, newPublicId } from '@/utils/ids';

import { caller, db, trpcError } from './helpers';
import { mockEmail } from './mocks';
import { ADMIN } from './seed';

// /admin/settings: the admin's own account settings and email notification
// preferences (tRPC users.admin*), and the recipient filter every admin email
// uses (getAdminEmails).

const SECOND_ADMIN = {
	id: newId(),
	publicId: newPublicId(),
	name: 'Second Admin',
	email: 'second-admin@example.test',
	role: 'admin',
};

async function addSecondAdmin() {
	const now = new Date();
	await db()
		.insert(user)
		.values({
			...SECOND_ADMIN,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
}

async function resetPreferences() {
	await db().delete(notificationPreferences);
}

describe('users.adminGetAccountSettings', () => {
	it('returns the profile, no password and every category on by default', async () => {
		await resetPreferences();
		const settings = await caller('admin').users.adminGetAccountSettings();
		expect(settings.profile).toEqual({
			name: ADMIN.name,
			email: ADMIN.email,
			emailVerified: true,
			phoneNumber: null,
		});
		expect(settings.hasPassword).toBe(false);
		expect(settings.notifications).toEqual(
			Object.fromEntries(notificationCategories.map((c) => [c, true])),
		);
	});

	it('hasPassword is true once a credential account has a password', async () => {
		const now = new Date();
		const id = newId();
		await db().insert(account).values({
			id,
			accountId: ADMIN.id,
			providerId: 'credential',
			userId: ADMIN.id,
			password: 'hashed-for-test',
			createdAt: now,
			updatedAt: now,
		});
		try {
			const settings = await caller('admin').users.adminGetAccountSettings();
			expect(settings.hasPassword).toBe(true);
		} finally {
			await db().delete(account);
		}
	});

	it('is admin-only', async () => {
		const error = await trpcError(
			caller('user').users.adminGetAccountSettings(),
		);
		expect(error.code).toBe('FORBIDDEN');
	});
});

describe('users.adminUpdateNotificationPreferences', () => {
	it('saves only the given categories and returns all of them', async () => {
		await resetPreferences();
		const saved = await caller(
			'admin',
		).users.adminUpdateNotificationPreferences({
			preferences: { new_booking: false, calendar_sync: false },
		});
		expect(saved).toMatchObject({
			new_booking: false,
			calendar_sync: false,
			booking_cancelled: true,
			refund_issued: true,
			payment_problem: true,
		});

		// Turning one back on updates the stored row (one row per category).
		const again = await caller(
			'admin',
		).users.adminUpdateNotificationPreferences({
			preferences: { new_booking: true },
		});
		expect(again.new_booking).toBe(true);
		expect(again.calendar_sync).toBe(false);
		const rows = await db().select().from(notificationPreferences);
		expect(rows).toHaveLength(2);
	});

	it('rejects unknown categories', async () => {
		const error = await trpcError(
			caller('admin').users.adminUpdateNotificationPreferences({
				preferences: { not_a_category: false } as never,
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
	});
});

describe('admin email recipients', () => {
	it('skips admins who turned a category off, per category', async () => {
		await resetPreferences();
		await addSecondAdmin();
		await caller('admin').users.adminUpdateNotificationPreferences({
			preferences: { calendar_sync: false },
		});

		expect(await getAdminEmails(db(), 'calendar_sync')).toEqual([
			SECOND_ADMIN.email,
		]);
		expect((await getAdminEmails(db(), 'payment_problem')).sort()).toEqual(
			[ADMIN.email, SECOND_ADMIN.email].sort(),
		);
	});

	it('an alert nobody wants is not sent', async () => {
		await resetPreferences();
		await addSecondAdmin();
		await db()
			.insert(notificationPreferences)
			.values(
				[ADMIN.id, SECOND_ADMIN.id].map((userId) => ({
					userId,
					category: 'calendar_sync' as const,
					emailEnabled: false,
				})),
			);
		const sent = mockEmail();
		const result = await sendAdminAlert(db(), env, {
			category: 'calendar_sync',
			subject: 'Calendar sync problem: test',
			heading: 'A calendar feed stopped syncing',
			paragraphs: ['Check the feed.'],
		});
		expect(result.success).toBe(true);
		expect(sent).toHaveLength(0);

		await sendAdminAlert(db(), env, {
			category: 'payment_problem',
			subject: 'Refund failed: test',
			heading: 'A refund failed',
			paragraphs: ['Check Stripe.'],
		});
		expect(sent).toHaveLength(1);
		expect(sent[0].to.sort()).toEqual([ADMIN.email, SECOND_ADMIN.email].sort());
	});
});

describe('users.adminSetPassword', () => {
	it('validates the password before calling Better Auth', async () => {
		const error = await trpcError(
			caller('admin').users.adminSetPassword({ newPassword: 'short' }),
		);
		expect(error.code).toBe('BAD_REQUEST');
	});

	it('needs a real Better Auth session (the request cookie)', async () => {
		// The test context has a synthetic session and no cookie, so Better
		// Auth's setPassword rejects it like an expired session.
		const error = await trpcError(
			caller('admin').users.adminSetPassword({ newPassword: 'Password123' }),
		);
		expect(error.code).toBe('UNAUTHORIZED');
	});

	it('is admin-only', async () => {
		const error = await trpcError(
			caller('user').users.adminSetPassword({ newPassword: 'Password123' }),
		);
		expect(error.code).toBe('FORBIDDEN');
	});
});
