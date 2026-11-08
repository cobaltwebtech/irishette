// Admin notification inbox: sources, kinds, statuses and the per-kind
// `details` shapes (Stripe events, system problems and contact form
// submissions). Shared by the schema, the server (src/lib/inbox-service.ts,
// the tRPC inbox router) and the admin pages. No secrets, no server imports.
// See docs/ADMIN_INBOX.md for how to add a kind.

/** Where a notification comes from. 'guest': the public contact form. */
export const inboxSources = ['stripe', 'system', 'guest'] as const;
export type InboxSource = (typeof inboxSources)[number];

/** What happened. Phase 3 adds 'payment_dispute'. */
export const inboxKinds = [
	'contact_form',
	'refund_auto',
	'refund_failed',
	'ical_sync_failed',
	'ical_conflict',
] as const;
export type InboxKind = (typeof inboxKinds)[number];

/** Shared by all admins: one status per item. */
export const inboxStatuses = ['new', 'read', 'archived'] as const;
export type InboxStatus = (typeof inboxStatuses)[number];

export const INBOX_SOURCE_LABELS: Record<InboxSource, string> = {
	stripe: 'Stripe',
	system: 'System',
	guest: 'Guest',
};

export const INBOX_KIND_LABELS: Record<InboxKind, string> = {
	contact_form: 'Contact form',
	refund_auto: 'Automatic refund',
	refund_failed: 'Refund failed',
	ical_sync_failed: 'Calendar sync failed',
	ical_conflict: 'Double booking',
};

/** The source each kind belongs to (one source per kind). */
export const INBOX_KIND_SOURCE: Record<InboxKind, InboxSource> = {
	contact_form: 'guest',
	refund_auto: 'system',
	refund_failed: 'stripe',
	ical_sync_failed: 'system',
	ical_conflict: 'system',
};

// --- details (small JSON; no secrets, no card data, no webhook payloads) ----

/**
 * A contact form submission, as the guest typed it (unverified). Admins reply
 * from their own mail client (mailto: the guest's email). Kept until deleted.
 */
interface ContactFormDetails {
	name: string;
	email: string;
	phone: string | null;
	subject: string;
	message: string;
	/** Format-checked only, never looked up. */
	bookingConfirmationId: string | null;
}

interface RefundAutoDetails {
	confirmationId: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	/** Dollars. */
	amount: number;
	paymentIntentId: string;
	refundId: string;
	livemode: boolean;
}

interface RefundFailedDetails {
	refundId: string;
	/** Dollars. */
	amount: number;
	currency: string;
	paymentIntentId: string | null;
	confirmationId: string | null;
	failureReason: string | null;
	livemode: boolean;
}

interface IcalSyncFailedDetails {
	roomName: string;
	roomPublicId: string;
	feedSource: string;
	feedLabel: string | null;
	problem: string;
}

interface IcalConflictDetails {
	roomName: string;
	roomPublicId: string;
	feedSource: string;
	feedLabel: string | null;
	conflicts: Array<{
		confirmationId: string;
		bookingPublicId: string;
		bookingStatus: string;
		checkInDate: string;
		checkOutDate: string;
		eventStart: string;
		eventEnd: string;
	}>;
}

export interface InboxDetailsByKind {
	contact_form: ContactFormDetails;
	refund_auto: RefundAutoDetails;
	refund_failed: RefundFailedDetails;
	ical_sync_failed: IcalSyncFailedDetails;
	ical_conflict: IcalConflictDetails;
}

export type InboxDetails = InboxDetailsByKind[InboxKind];

/** Stripe Dashboard link for a PaymentIntent (test or live mode). */
export function stripePaymentUrl(paymentIntentId: string, livemode: boolean) {
	return `https://dashboard.stripe.com/${livemode ? '' : 'test/'}payments/${paymentIntentId}`;
}

/** `mailto:` link that replies to a contact form submission. */
export function contactReplyHref(details: { email: string; subject: string }) {
	const subject = details.subject.startsWith('Re:')
		? details.subject
		: `Re: ${details.subject}`;
	// The address was validated on submit; encode it anyway so it can never
	// add headers (keep '@' readable for mail clients).
	const to = encodeURIComponent(details.email).replace(/%40/g, '@');
	return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}
