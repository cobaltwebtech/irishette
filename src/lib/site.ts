// Site-wide constants: domain, contact details, email senders and the
// property's fixed times. Pure and safe for client code (no secrets).
//
// GO-LIVE: the domain, the senders, the reply-to/contact address and the
// phone number are hardcoded on purpose and must be switched to the
// production values before launch (see "Domain switch checklist" in
// .agents/plans/02-cleanup-and-fixes-2026-11.md). The phone number is a
// placeholder until the client provides the real one.

export { PROPERTY_TIMEZONE } from '@/utils/timezone';

export const SITE_NAME = 'Irishette';
export const SITE_URL = 'https://www.irishette.com';

export const CONTACT_EMAIL = 'info@irishette.com';
/** Placeholder until the client provides the real number. */
export const CONTACT_PHONE = '(123) 456-7890';
/** `tel:` link for CONTACT_PHONE (keep the two in sync). */
export const CONTACT_PHONE_HREF = 'tel:+1234567890';

// Resend senders (the sending domain must be verified in Resend).
export const EMAIL_FROM_BOOKINGS = `${SITE_NAME} Dev <bookings@contact.cobaltweb.tech>`;
export const EMAIL_FROM_ADMIN = `${SITE_NAME} <admin@contact.cobaltweb.tech>`;
export const EMAIL_FROM_AUTH = `${SITE_NAME} <auth@contact.cobaltweb.tech>`;
/**
 * Reply-to for emails guests may answer (contact replies, plan 02 Phase 4).
 * @expected-unused
 */
export const EMAIL_REPLY_TO = CONTACT_EMAIL;

// Property times of day ("HH:MM", 24 h), always in PROPERTY_TIMEZONE
// (America/Chicago wall-clock time).
export const CHECK_IN_TIME = '16:00';
export const CHECK_OUT_TIME = '11:00';
/** Same-day check-in is allowed only before this time (plan 02, 3.9). */
export const SAME_DAY_CUTOFF_TIME = '09:00';

/** Short label for the property time zone. */
const PROPERTY_TIMEZONE_LABEL = 'CT';

/**
 * Formats an "HH:MM" time of day as "4:00 PM" (or "4:00 PM CT" with
 * `withZone`). Pure string math, independent of the runtime locale and
 * time zone.
 */
export function formatTimeOfDay(
	time: string,
	{ withZone = false }: { withZone?: boolean } = {},
): string {
	const [hours = 0, minutes = 0] = time.split(':').map(Number);
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	const suffix = hours < 12 ? 'AM' : 'PM';
	const label = `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
	return withZone ? `${label} ${PROPERTY_TIMEZONE_LABEL}` : label;
}

/** "4:00 PM CT" */
export const CHECK_IN_TIME_LABEL = formatTimeOfDay(CHECK_IN_TIME, {
	withZone: true,
});
/** "11:00 AM CT" */
export const CHECK_OUT_TIME_LABEL = formatTimeOfDay(CHECK_OUT_TIME, {
	withZone: true,
});
/** "9:00 AM CT" */
export const SAME_DAY_CUTOFF_LABEL = formatTimeOfDay(SAME_DAY_CUTOFF_TIME, {
	withZone: true,
});
