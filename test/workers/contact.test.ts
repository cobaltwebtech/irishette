import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { adminInboxItems } from '@/db/schema-export';
import { submitContactForm } from '@/lib/inbox/contact-service';
import type { ContactInput } from '@/lib/inbox/contact-validation';
import { verifyTurnstile } from '@/lib/inbox/turnstile';
import { CONTACT_EMAIL, EMAIL_FROM_ADMIN } from '@/lib/site';

import { db, inboxItemsOfKind } from './helpers';
import { mockEmail, mockTurnstile } from './mocks';

// The contact form service (the Start server function only adds the rate
// limit and the Zod validator; see test/unit/contact.test.ts).

const input: ContactInput = {
	name: 'Casey Guest',
	email: 'casey@example.test',
	phone: '(555) 555-0100',
	subject: 'Late arrival',
	message: 'Hello,\n\nWe will arrive around 10 PM. Is that OK?',
	bookingConfirmationId: 'ABC234',
	turnstileToken: 'token-123',
};

const deps = () => ({ db: db(), env });

beforeEach(async () => {
	await db().delete(adminInboxItems);
});

describe('submitContactForm', () => {
	it('verifies Turnstile, stores a guest notification and emails CONTACT_EMAIL', async () => {
		const siteverify = mockTurnstile({ success: true });
		const sent = mockEmail();

		const result = await submitContactForm(deps(), input, '203.0.113.7');
		expect(result).toEqual({ ok: true });

		expect(siteverify).toHaveLength(1);
		expect(siteverify[0].get('secret')).toBe(env.TURNSTILE_SECRET_KEY);
		expect(siteverify[0].get('response')).toBe('token-123');
		expect(siteverify[0].get('remoteip')).toBe('203.0.113.7');

		const [item] = await inboxItemsOfKind('contact_form');
		expect(item).toMatchObject({
			source: 'guest',
			status: 'new',
			title: 'Late arrival',
			bookingId: null,
			userId: null,
		});
		expect(item.summary).toContain('Casey Guest');
		expect(item.details).toEqual({
			name: 'Casey Guest',
			email: 'casey@example.test',
			phone: '(555) 555-0100',
			subject: 'Late arrival',
			message: 'Hello,\n\nWe will arrive around 10 PM. Is that OK?',
			bookingConfirmationId: 'ABC234',
		});

		// One email, to the admin address only, with the guest as reply-to.
		expect(sent).toEqual([
			{
				to: [CONTACT_EMAIL],
				from: EMAIL_FROM_ADMIN,
				replyTo: ['casey@example.test'],
				subject: 'Contact form: Late arrival',
				text: expect.any(String),
			},
		]);
	});

	it('a rejected token stores and sends nothing', async () => {
		mockTurnstile({
			success: false,
			'error-codes': ['invalid-input-response'],
		});
		const sent = mockEmail();
		const result = await submitContactForm(deps(), input, null);
		expect(result).toEqual({ ok: false, reason: 'turnstile' });
		expect(sent).toHaveLength(0);
		expect(await inboxItemsOfKind('contact_form')).toHaveLength(0);
	});

	it('fails closed when Siteverify errors', async () => {
		mockTurnstile({ status: 500 });
		const sent = mockEmail();
		const result = await submitContactForm(deps(), input, null);
		expect(result).toEqual({ ok: false, reason: 'unavailable' });
		expect(sent).toHaveLength(0);
		expect(await inboxItemsOfKind('contact_form')).toHaveLength(0);
	});

	it('still succeeds when only the email fails (the dashboard has it)', async () => {
		mockTurnstile({ success: true });
		mockEmail({ failFirst: 1 });
		const result = await submitContactForm(deps(), input, null);
		expect(result).toEqual({ ok: true });
		expect(await inboxItemsOfKind('contact_form')).toHaveLength(1);
	});
});

describe('verifyTurnstile', () => {
	it('fails closed on a timeout', async () => {
		mockTurnstile('hang');
		expect(
			await verifyTurnstile('secret', 'token', null, { timeoutMs: 50 }),
		).toEqual({ success: false, reason: 'unavailable' });
	});

	it('rejects an empty token without calling Siteverify', async () => {
		const siteverify = mockTurnstile({ success: true });
		expect(await verifyTurnstile('secret', '', null)).toEqual({
			success: false,
			reason: 'invalid',
		});
		expect(siteverify).toHaveLength(0);
	});
});
