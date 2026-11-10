import { sendContactNotification } from '@/lib/email/email-service';
import type { ServiceDeps } from '@/lib/server/deps';

import type { ContactInput } from './contact-validation';
import { createInboxItem } from './inbox-service';
import { verifyTurnstile } from './turnstile';

// The public contact form (docs/CONTACT_FORM.md). Server-only. Called by the
// TanStack Start server function in src/core/functions/contact.ts; kept here
// so workers tests can run it without Start.

export type ContactResult =
	| { ok: true }
	| { ok: false; reason: 'turnstile' | 'unavailable' | 'send_failed' };

const SUMMARY_LENGTH = 140;

function snippet(text: string) {
	const oneLine = text.replace(/\s+/g, ' ').trim();
	return oneLine.length > SUMMARY_LENGTH
		? `${oneLine.slice(0, SUMMARY_LENGTH - 1)}…`
		: oneLine;
}

/**
 * Verifies the Turnstile token, then stores the message as an admin
 * notification (source 'guest', with a mailto reply in the dashboard) and
 * emails it to CONTACT_EMAIL with the guest as reply-to. Succeeds when at
 * least one of the two worked, so the admins always see it somewhere.
 * Nothing is sent to the guest.
 */
export async function submitContactForm(
	deps: Pick<ServiceDeps, 'db' | 'env'>,
	input: ContactInput,
	remoteIp: string | null,
): Promise<ContactResult> {
	const turnstile = await verifyTurnstile(
		deps.env.TURNSTILE_SECRET_KEY,
		input.turnstileToken,
		remoteIp,
	);
	if (!turnstile.success) {
		return {
			ok: false,
			reason: turnstile.reason === 'invalid' ? 'turnstile' : 'unavailable',
		};
	}

	const contact = {
		name: input.name,
		email: input.email,
		phone: input.phone ?? null,
		subject: input.subject,
		message: input.message,
		bookingConfirmationId: input.bookingConfirmationId ?? null,
	};
	const publicId = await createInboxItem(deps, {
		kind: 'contact_form',
		title: input.subject,
		summary: `${input.name}: ${snippet(input.message)}`,
		details: contact,
	});
	const email = await sendContactNotification(deps.env, {
		...input,
		inboxPath: publicId ? `/admin/inbox/${publicId}` : undefined,
	});
	if (!publicId && !email.success) {
		console.error('Contact form: not stored and not emailed');
		return { ok: false, reason: 'send_failed' };
	}
	return { ok: true };
}
