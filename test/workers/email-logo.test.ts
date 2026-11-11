import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';
import {
	sendAdminAlert,
	sendBookingConfirmedEmails,
	sendMagicLinkEmail,
	sendPaymentFailedEmail,
	sendVerificationEmail,
} from '@/lib/email/email-service';
import { LOGO_PATH, SITE_URL } from '@/lib/site';

import { db, insertBooking } from './helpers';

// Every template shows the logo, served from the host in BETTER_AUTH_URL
// (the deployed hostname) and linked to the public site.

const LOGO_URL = new URL(LOGO_PATH, env.BETTER_AUTH_URL).toString();
const room = { name: 'Rose Room' };

function captureHtml() {
	const html: string[] = [];
	env.EMAIL = {
		send: async (m: { html?: string }) => {
			html.push(m.html ?? '');
			return { messageId: 'm' };
		},
	} as unknown as SendEmail;
	return html;
}

function expectLogo(html: string) {
	expect(html).toContain(`src="${LOGO_URL}"`);
	expect(html).toContain(`href="${SITE_URL}"`);
}

describe('email logo', () => {
	it('points at the deployed host', () => {
		expect(LOGO_URL).toBe(`${env.BETTER_AUTH_URL}${LOGO_PATH}`);
	});

	it('is in the auth emails', async () => {
		const html = captureHtml();
		await sendMagicLinkEmail(env, 'guest@example.test', 'https://x.test/l');
		await sendVerificationEmail(env, 'guest@example.test', 'https://x.test/v');
		expect(html).toHaveLength(2);
		html.forEach(expectLogo);
	});

	it('is in the booking emails (guest, admin, notice) and alerts', async () => {
		const html = captureHtml();
		const { id } = await insertBooking();
		const [booking] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, id));
		await sendBookingConfirmedEmails(db(), env, booking, room);
		await sendPaymentFailedEmail(db(), env, booking, room);
		await sendAdminAlert(db(), env, {
			subject: 'Logo alert',
			heading: 'Alert',
			paragraphs: ['Hello'],
		});
		// guest confirmation + admin notification + notice + alert
		expect(html).toHaveLength(4);
		html.forEach(expectLogo);
	});
});
