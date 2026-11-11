// Site-wide constants: domain, contact details, email senders and the
// property's fixed times. Pure and safe for client code (no secrets).
//
// GO-LIVE: the domain, the senders, the reply-to/contact address and the
// phone number are hardcoded on purpose and must be switched to the
// production values before launch (see "Domain switch checklist" in
// .agents/plans/02-cleanup-and-fixes-2026-11.md).

export { PROPERTY_TIMEZONE } from '@/utils/timezone';

export const SITE_NAME = 'Irishette';
export const SITE_URL = 'https://www.irishette.com';

/** The logo (public/icons), served from the deployed host. */
export const LOGO_PATH = '/icons/irishette-logo.png';

export const CONTACT_EMAIL = 'bookings@irishette.com';
/**
 * The property phone in full international (E.164) format: for `tel:` links,
 * structured data and anything a machine reads. The one place the number is
 * written; the display form below is derived from it.
 */
export const CONTACT_PHONE_E164 = '+12544545558';
/** `tel:` link for the property phone. */
export const CONTACT_PHONE_HREF = `tel:${CONTACT_PHONE_E164}`;

/** "+12544545558" -> "254-454-5558" (US numbers; anything else is unchanged). */
export function formatPhoneDisplay(e164: string): string {
	const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	return match ? `${match[1]}-${match[2]}-${match[3]}` : e164;
}
/** The phone as shown on pages and in emails: "254-454-5558". */
export const CONTACT_PHONE = formatPhoneDisplay(CONTACT_PHONE_E164);

/** Street address of the property (schema.org PostalAddress fields). */
export interface PropertyAddress {
	streetAddress: string;
	addressLocality: string;
	/** State, e.g. "TX". */
	addressRegion: string;
	postalCode: string;
	/** ISO 3166-1 alpha-2, e.g. "US". */
	addressCountry: string;
}

/**
 * Where guests stay. Shown in the footer and the booking confirmation email,
 * and sent as structured data for the Gmail/Outlook reservation card
 * (docs/EMAIL_RESERVATION_MARKUP.md).
 */
export const PROPERTY_ADDRESS: PropertyAddress = {
	streetAddress: '506 W Mesquite St',
	addressLocality: 'Dublin',
	addressRegion: 'TX',
	postalCode: '76446',
	addressCountry: 'US',
};

/** "506 W Mesquite St, Dublin, TX 76446" */
export function formatAddress(a: PropertyAddress): string {
	return `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion} ${a.postalCode}`;
}

/** A sender in the named-address form the Email Service binding accepts. */
export interface EmailSender {
	name: string;
	email: string;
}

// Email senders (the sending domain must be onboarded in Cloudflare Email
// Service: Compute > Email Service > Email Sending).
export const EMAIL_FROM_BOOKINGS: EmailSender = {
	name: `${SITE_NAME} Dev`,
	email: 'irishette-bookings@cobaltweb.dev',
};
export const EMAIL_FROM_ADMIN: EmailSender = {
	name: SITE_NAME,
	email: 'irishette-admin@cobaltweb.dev',
};
export const EMAIL_FROM_AUTH: EmailSender = {
	name: SITE_NAME,
	email: 'irishette-auth@cobaltweb.dev',
};
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
