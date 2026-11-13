import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';
import {
	sendBookingConfirmedEmails,
	sendMagicLinkEmail,
} from '@/lib/email/email-service';
import {
	CONTACT_EMAIL,
	EMAIL_FROM_ADMIN,
	EMAIL_FROM_AUTH,
	EMAIL_FROM_BOOKINGS,
} from '@/lib/site';

import { db, insertBooking } from './helpers';
import { mockEmail } from './mocks';

// Senders live in src/lib/site.ts and must all use the one sending domain
// onboarded in Cloudflare Email Service. The sending subdomain has no inbox,
// so guest-facing booking emails reply to CONTACT_EMAIL.

const domain = (email: string) => email.split('@')[1];

describe('email senders', () => {
	it('send from one domain, and not the contact address domain', () => {
		const senders = [EMAIL_FROM_BOOKINGS, EMAIL_FROM_ADMIN, EMAIL_FROM_AUTH];
		const domains = new Set(senders.map((s) => domain(s.email)));
		expect(domains.size).toBe(1);
		expect([...domains][0]).not.toBe(domain(CONTACT_EMAIL));
	});

	it('uses the booking sender for guests and the admin sender for admins', async () => {
		const sent = mockEmail();
		const { id } = await insertBooking();
		const [booking] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, id));
		await sendBookingConfirmedEmails(db(), env, booking, { name: 'Rose Room' });
		const toGuest = sent.find((e) => e.to.includes(booking.guestEmail));
		const toAdmin = sent.find((e) => !e.to.includes(booking.guestEmail));
		expect(toGuest?.from).toEqual(EMAIL_FROM_BOOKINGS);
		expect(toAdmin?.from).toEqual(EMAIL_FROM_ADMIN);
		// Guests can answer the confirmation; it reaches the contact inbox.
		expect(toGuest?.replyTo).toEqual([CONTACT_EMAIL]);
		expect(toAdmin?.replyTo).toEqual([]);
	});

	it('uses the auth sender for sign-in emails', async () => {
		const sent = mockEmail();
		await sendMagicLinkEmail(env, 'guest@example.test', 'https://x.test/l');
		expect(sent[0].from).toEqual(EMAIL_FROM_AUTH);
	});
});
