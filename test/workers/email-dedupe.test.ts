import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';

import { bookings, sentEmails } from '@/db/schema-export';
import {
	alertWindowStart,
	claimAlert,
	claimEmail,
	purgeSentEmails,
	releaseEmail,
	SENT_EMAIL_RETENTION_DAYS,
} from '@/lib/email/email-dedupe';
import {
	sendAdminAlert,
	sendPaymentFailedEmail,
} from '@/lib/email/email-service';

import { db, insertBooking, useClock } from './helpers';
import { mockEmail } from './mocks';
import { ADMIN } from './seed';

// Duplicate protection (sent_emails): message claims and the hourly alert
// throttle. Clock: 2031-03-04 10:20 UTC, so "the next hour" is 11:00.

useClock('2031-03-04T10:20:00Z');

const room = { name: 'Rose Room' };

async function storedBooking() {
	const { id } = await insertBooking();
	const [booking] = await db()
		.select()
		.from(bookings)
		.where(eq(bookings.id, id));
	return booking;
}

const alert = {
	subject: 'Calendar sync problem: Rose Room (airbnb)',
	heading: 'A calendar feed stopped syncing',
	paragraphs: ['Check the feed.'],
};

describe('claims', () => {
	it('a key is claimed once, and a released key can be claimed again', async () => {
		expect(await claimEmail(db(), 'k#0', 'message')).toBe(true);
		expect(await claimEmail(db(), 'k#0', 'message')).toBe(false);
		await releaseEmail(db(), 'k#0');
		expect(await claimEmail(db(), 'k#0', 'message')).toBe(true);
	});

	it('purges only rows older than the retention period', async () => {
		const now = new Date();
		const old = new Date(
			now.getTime() - (SENT_EMAIL_RETENTION_DAYS + 1) * 86_400_000,
		);
		await db()
			.insert(sentEmails)
			.values([
				{ key: 'old', kind: 'message', sentAt: old },
				{ key: 'recent', kind: 'message', sentAt: now },
			]);
		expect(await purgeSentEmails(db(), now)).toBe(1);
		const keys = (await db().select().from(sentEmails)).map((r) => r.key);
		expect(keys).toEqual(['recent']);
	});
});

describe('message dedupe', () => {
	it('a repeated key sends once', async () => {
		const sent = mockEmail();
		const booking = await storedBooking();
		const first = await sendPaymentFailedEmail(db(), env, booking, room);
		const second = await sendPaymentFailedEmail(db(), env, booking, room);
		expect(first).toEqual({ success: true });
		expect(second).toEqual({ success: true });
		expect(sent).toHaveLength(1);
	});

	it('a failed send releases the claim so a retry sends', async () => {
		const sent = mockEmail({ failFirst: 1 });
		const booking = await storedBooking();
		const failed = await sendPaymentFailedEmail(db(), env, booking, room);
		expect(failed.success).toBe(false);
		expect(sent).toHaveLength(0);
		const retried = await sendPaymentFailedEmail(db(), env, booking, room);
		expect(retried).toEqual({ success: true });
		expect(sent).toHaveLength(1);
	});

	it('sends HTML and plain text', async () => {
		const bodies: Array<{ html?: string; text?: string }> = [];
		env.EMAIL = {
			send: async (m: { html?: string; text?: string }) => {
				bodies.push(m);
				return { messageId: 'm1' };
			},
		} as unknown as SendEmail;
		const booking = await storedBooking();
		await sendPaymentFailedEmail(db(), env, booking, room);
		expect(bodies).toHaveLength(1);
		expect(bodies[0].html).toContain('<html');
		expect(bodies[0].text).toContain(booking.confirmationId);
		expect(bodies[0].text).not.toContain('<html');
	});
});

describe('admin alert throttle', () => {
	it('sends the first alert in an hour and suppresses repeats', async () => {
		const sent = mockEmail();
		await sendAdminAlert(db(), env, alert);
		await sendAdminAlert(db(), env, alert);
		await sendAdminAlert(db(), env, alert);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual([ADMIN.email]);
		const [row] = await db().select().from(sentEmails);
		expect(row).toMatchObject({ kind: 'alert', suppressedCount: 2 });
	});

	it('reports the suppressed count in the next hour', async () => {
		const bodies: string[] = [];
		env.EMAIL = {
			send: async (m: { text?: string }) => {
				bodies.push(m.text ?? '');
				return { messageId: 'm1' };
			},
		} as unknown as SendEmail;
		await sendAdminAlert(db(), env, alert);
		await sendAdminAlert(db(), env, alert);
		await sendAdminAlert(db(), env, alert);
		expect(bodies).toHaveLength(1);
		expect(bodies[0]).not.toContain('suppressed');

		vi.setSystemTime(new Date('2031-03-04T11:05:00Z'));
		try {
			await sendAdminAlert(db(), env, alert);
		} finally {
			vi.setSystemTime(new Date('2031-03-04T10:20:00Z'));
		}
		expect(bodies).toHaveLength(2);
		expect(bodies[1]).toContain(
			'Similar alerts suppressed in the previous hour',
		);
		expect(bodies[1]).toContain('2');
	});

	it('different alerts do not throttle each other', async () => {
		const sent = mockEmail();
		await sendAdminAlert(db(), env, alert);
		await sendAdminAlert(db(), env, { ...alert, subject: 'Another problem' });
		await sendAdminAlert(db(), env, {
			...alert,
			subject: alert.subject,
			idempotencyKey: 'by-key',
		});
		expect(sent).toHaveLength(3);
	});

	it('a failed alert frees the slot', async () => {
		const sent = mockEmail({ failFirst: 1 });
		expect((await sendAdminAlert(db(), env, alert)).success).toBe(false);
		expect(await sendAdminAlert(db(), env, alert)).toEqual({ success: true });
		expect(sent).toHaveLength(1);
	});

	it('claimAlert windows start on the hour', async () => {
		expect(alertWindowStart(new Date('2031-03-04T10:59:59Z'))).toBe(
			Date.parse('2031-03-04T10:00:00Z') / 1000,
		);
		const first = await claimAlert(db(), 'x', new Date());
		expect(first).toMatchObject({ send: true, suppressedBefore: 0 });
		expect(await claimAlert(db(), 'x', new Date())).toEqual({ send: false });
	});
});
