import React from 'react';
import { type CreateEmailOptions, Resend } from 'resend';

import { AdminBookingNotificationEmail } from '@/components/email/AdminBookingNotificationEmail';
import { BookingConfirmationEmail } from '@/components/email/BookingConfirmationEmail';
import type { EmailBookingDetails } from '@/components/email/BookingDetailsSection';
import { BookingNoticeEmail } from '@/components/email/BookingNoticeEmail';
import { MagicLinkEmail } from '@/components/email/MagicLinkEmail';
import {
	NotificationEmail,
	type NotificationEmailProps,
} from '@/components/email/NotificationEmail';
import { PasswordReset } from '@/components/email/PasswordReset';
import type { Database } from '@/db/drizzle-init';
import type { bookings } from '@/db/schema-export';

import { getAdminEmails } from './admin-query';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
	PASSWORD_RESET_EXPIRES_IN,
} from './auth-constants';
import { formatMoney } from './format';
import {
	CHECK_IN_TIME,
	CHECK_OUT_TIME,
	CONTACT_EMAIL,
	EMAIL_FROM_ADMIN,
	EMAIL_FROM_AUTH,
	EMAIL_FROM_BOOKINGS,
	formatTimeOfDay,
	SITE_URL,
} from './site';
import { formatInstantCT } from './timezone';

// All transactional email goes through here. Logs never include email
// addresses or guest details: only the kind of email and the booking's
// confirmation id. Senders and contact details live in src/lib/site.ts
// (they change at go-live).

export interface EmailEnv {
	RESEND_API_KEY: string;
	BETTER_AUTH_URL: string;
}

type Booking = typeof bookings.$inferSelect;
interface RoomInfo {
	name: string;
}

export interface EmailResult {
	success: boolean;
	error?: string;
}

const currency = formatMoney;

const stayDate = new Intl.DateTimeFormat('en-US', {
	timeZone: 'UTC',
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});

/** "2030-06-10" -> "Monday, June 10, 2030" (a property-local stay date). */
const formatStayDate = (date: string) =>
	stayDate.format(new Date(`${date}T00:00:00Z`));

/** The booking details every booking email shows (shared email section). */
export function emailBookingDetails(
	booking: Booking,
	room: RoomInfo,
): EmailBookingDetails {
	return {
		confirmationId: booking.confirmationId,
		roomName: room.name,
		checkInDate: formatStayDate(booking.checkInDate),
		checkInTime: formatTimeOfDay(CHECK_IN_TIME, { withZone: true }),
		checkOutDate: formatStayDate(booking.checkOutDate),
		checkOutTime: formatTimeOfDay(CHECK_OUT_TIME, { withZone: true }),
		numberOfNights: booking.numberOfNights,
		numberOfGuests: booking.numberOfGuests,
		guestName: booking.guestName,
		guestEmail: booking.guestEmail,
		guestPhone: booking.guestPhone,
		specialRequests: booking.specialRequests,
		baseAmount: booking.baseAmount,
		feesAmount: booking.feesAmount ?? 0,
		taxAmount: booking.taxAmount ?? 0,
		totalAmount: booking.totalAmount,
	};
}

/** Stripe: refunds reach the card in 5-10 business days. */
const REFUND_TIMING =
	'Refunds go back to your original payment method. Please allow 5-10 business days for it to appear.';

function guestConfirmation(
	booking: Booking,
	room: RoomInfo,
	baseUrl: string,
): CreateEmailOptions {
	return {
		from: EMAIL_FROM_BOOKINGS,
		to: [booking.guestEmail],
		subject: `Booking Confirmed - ${booking.confirmationId} | Irishette Bed & Breakfast`,
		react: React.createElement(BookingConfirmationEmail, {
			booking: emailBookingDetails(booking, room),
			accountUrl: `${baseUrl}/account`,
			siteUrl: SITE_URL,
			contactEmail: CONTACT_EMAIL,
		}),
	};
}

function bookingNotice(
	from: string,
	to: string[],
	subject: string,
	props: Omit<React.ComponentProps<typeof BookingNoticeEmail>, 'contactEmail'>,
): CreateEmailOptions {
	return {
		from,
		to,
		subject,
		react: React.createElement(BookingNoticeEmail, {
			...props,
			contactEmail: CONTACT_EMAIL,
		}),
	};
}

function adminBookingNotification(
	booking: Booking,
	room: RoomInfo,
	adminEmails: string[],
	baseUrl: string,
): CreateEmailOptions {
	return {
		from: EMAIL_FROM_ADMIN,
		to: adminEmails,
		subject: `New Booking Alert: ${booking.confirmationId} - ${booking.guestName}`,
		react: React.createElement(AdminBookingNotificationEmail, {
			confirmationId: booking.confirmationId,
			guestName: booking.guestName,
			guestEmail: booking.guestEmail,
			guestPhone: booking.guestPhone ?? undefined,
			roomName: room.name,
			checkInDate: booking.checkInDate,
			checkOutDate: booking.checkOutDate,
			numberOfNights: booking.numberOfNights,
			numberOfGuests: booking.numberOfGuests,
			specialRequests: booking.specialRequests ?? undefined,
			totalAmount: booking.totalAmount,
			adminDashboardUrl: `${baseUrl}/admin/bookings/${booking.publicId}`,
		}),
	};
}

function notification(
	from: string,
	to: string[],
	subject: string,
	props: NotificationEmailProps,
): CreateEmailOptions {
	return {
		from,
		to,
		subject,
		react: React.createElement(NotificationEmail, props),
	};
}

async function sendBatch(
	env: Pick<EmailEnv, 'RESEND_API_KEY'>,
	kind: string,
	emails: CreateEmailOptions[],
	idempotencyKey?: string,
): Promise<EmailResult> {
	if (emails.length === 0) return { success: true };
	if (!env.RESEND_API_KEY) {
		console.error(`Email (${kind}) not sent: RESEND_API_KEY is not set`);
		return { success: false, error: 'Email service not configured' };
	}
	try {
		const resend = new Resend(env.RESEND_API_KEY);
		const { error } =
			emails.length === 1
				? await resend.emails.send(emails[0], { idempotencyKey })
				: await resend.batch.send(emails, { idempotencyKey });
		if (error) {
			console.error(`Email (${kind}) failed:`, error.name, error.message);
			return { success: false, error: 'Email delivery failed' };
		}
		return { success: true };
	} catch (error) {
		console.error(
			`Email (${kind}) failed:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return { success: false, error: 'Email delivery failed' };
	}
}

/** Guest confirmation + admin notification, once per booking. */
export async function sendBookingConfirmedEmails(
	db: Database,
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
): Promise<EmailResult> {
	const adminEmails = await getAdminEmails(db);
	const emails = [guestConfirmation(booking, room, env.BETTER_AUTH_URL)];
	if (adminEmails.length > 0) {
		emails.push(
			adminBookingNotification(booking, room, adminEmails, env.BETTER_AUTH_URL),
		);
	}
	return sendBatch(
		env,
		`booking confirmed ${booking.confirmationId}`,
		emails,
		`booking-confirmed/${booking.id}`,
	);
}

/** Re-sends the guest confirmation (account / admin "resend" button). */
export function sendBookingConfirmationEmail(
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
): Promise<EmailResult> {
	return sendBatch(env, `confirmation resend ${booking.confirmationId}`, [
		guestConfirmation(booking, room, env.BETTER_AUTH_URL),
	]);
}

export interface CancellationEmailInfo {
	refundAmount: number;
	cancelledBy: 'guest' | 'admin' | 'system';
	/** Shown to the guest. */
	guestMessage: string;
	/** Shown to admins. */
	adminMessage: string;
}

type NoticeContent = Pick<
	React.ComponentProps<typeof BookingNoticeEmail>,
	'preview' | 'heading' | 'paragraphs'
> & { subject: string };

/**
 * One booking update for the guest and the admins: both get the highlighted
 * section and the full booking details; the guest links to their account,
 * the admins to the booking (amber frame).
 */
async function sendBookingNotices(
	db: Database,
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
	notice: {
		kind: string;
		idempotencyKey: string;
		highlight: React.ComponentProps<typeof BookingNoticeEmail>['highlight'];
		guest: NoticeContent;
		admin: NoticeContent;
	},
): Promise<EmailResult> {
	const details = emailBookingDetails(booking, room);
	const { subject: guestSubject, ...guest } = notice.guest;
	const emails = [
		bookingNotice(EMAIL_FROM_BOOKINGS, [booking.guestEmail], guestSubject, {
			...guest,
			highlight: notice.highlight,
			booking: details,
			button: {
				label: 'View your bookings',
				href: `${env.BETTER_AUTH_URL}/account`,
			},
		}),
	];
	const adminEmails = await getAdminEmails(db);
	if (adminEmails.length > 0) {
		const { subject: adminSubject, ...admin } = notice.admin;
		emails.push(
			bookingNotice(EMAIL_FROM_ADMIN, adminEmails, adminSubject, {
				...admin,
				highlight: notice.highlight,
				booking: details,
				button: {
					label: 'Open booking',
					href: `${env.BETTER_AUTH_URL}/admin/bookings/${booking.publicId}`,
				},
				tone: 'alert',
			}),
		);
	}
	return sendBatch(env, notice.kind, emails, notice.idempotencyKey);
}

/** Guest cancellation notice + admin notification (full booking details). */
export function sendCancellationEmails(
	db: Database,
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
	info: CancellationEmailInfo,
): Promise<EmailResult> {
	return sendBookingNotices(db, env, booking, room, {
		kind: `booking cancelled ${booking.confirmationId}`,
		idempotencyKey: `booking-cancelled/${booking.id}`,
		highlight: {
			title: 'Cancellation',
			rows: [
				{ label: 'Cancelled by', value: info.cancelledBy },
				{ label: 'Amount paid', value: currency(booking.totalAmount) },
				{ label: 'Refund', value: currency(info.refundAmount) },
			],
		},
		guest: {
			subject: `Booking Cancelled - ${booking.confirmationId} | Irishette Bed & Breakfast`,
			preview: `Your booking ${booking.confirmationId} was cancelled`,
			heading: 'Your booking was cancelled',
			paragraphs: [
				`Hi ${booking.guestName},`,
				info.guestMessage,
				info.refundAmount > 0
					? REFUND_TIMING
					: 'No refund is due for this cancellation under our cancellation policy.',
			],
		},
		admin: {
			subject: `Booking Cancelled: ${booking.confirmationId} (${info.cancelledBy})`,
			preview: `Booking ${booking.confirmationId} was cancelled`,
			heading: 'Booking cancelled',
			paragraphs: [info.adminMessage],
		},
	});
}

/** A refund made in the Stripe Dashboard, as the webhook reports it. */
export interface RefundEmailInfo {
	refundId: string;
	/** Dollars. */
	amount: number;
	currency: string;
	/** pending, requires_action, succeeded, failed, canceled */
	status: string;
	reason: string | null;
	/** Refund creation time (Stripe). */
	created: Date;
	/** Dollars refunded on the payment so far, and what is still paid. */
	totalRefunded: number;
	remainingPaid: number;
	cardBrand: string | null;
	cardLast4: string | null;
	/** Card network trace reference (ARN), when Stripe has it. */
	reference: string | null;
}

const REFUND_REASONS: Record<string, string> = {
	requested_by_customer: 'Requested by the guest',
	duplicate: 'Duplicate payment',
	fraudulent: 'Fraudulent payment',
	expired_uncaptured_charge: 'Uncaptured payment expired',
};

const REFUND_STATUSES: Record<string, string> = {
	pending: 'Pending',
	requires_action: 'Needs action',
	succeeded: 'Completed',
	failed: 'Failed',
	canceled: 'Cancelled',
};

/**
 * Guest + admin emails for a refund made in the Stripe Dashboard, with the
 * full booking details and the refund details. Idempotent per refund status
 * (and once more when the trace reference appears).
 */
export function sendRefundEmails(
	db: Database,
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
	refund: RefundEmailInfo,
): Promise<EmailResult> {
	const cancelled = booking.status === 'cancelled';
	const rows = [
		{ label: 'Refund', value: currency(refund.amount, refund.currency) },
		{
			label: 'Status',
			value: REFUND_STATUSES[refund.status] ?? refund.status,
		},
		{
			label: 'Reason',
			value: refund.reason
				? (REFUND_REASONS[refund.reason] ?? refund.reason)
				: 'Not given',
		},
		{
			label: 'Refunded so far',
			value: currency(refund.totalRefunded, refund.currency),
		},
		{
			label: 'Remaining paid',
			value: currency(refund.remainingPaid, refund.currency),
		},
		...(refund.cardBrand && refund.cardLast4
			? [
					{
						label: 'Card',
						value: `${refund.cardBrand.toUpperCase()} ending ${refund.cardLast4}`,
					},
				]
			: []),
		{ label: 'Date', value: formatInstantCT(refund.created) },
		...(refund.reference
			? [{ label: 'Trace reference', value: refund.reference }]
			: []),
		{ label: 'Refund ID', value: refund.refundId },
		{
			label: 'Booking status',
			value: cancelled ? 'Cancelled' : 'Confirmed',
		},
	];
	const amount = currency(refund.amount, refund.currency);
	const status = REFUND_STATUSES[refund.status] ?? refund.status;
	return sendBookingNotices(db, env, booking, room, {
		kind: `refund ${refund.status} ${booking.confirmationId}`,
		idempotencyKey: `refund/${refund.refundId}/${refund.status}${refund.reference ? '/ref' : ''}`,
		highlight: { title: 'Refund details', rows },
		guest: {
			subject: `Refund ${refund.status === 'succeeded' ? 'issued' : 'update'} - ${booking.confirmationId} | Irishette Bed & Breakfast`,
			preview: `A refund of ${amount} for booking ${booking.confirmationId}`,
			heading: cancelled
				? 'Your booking was refunded and cancelled'
				: 'A refund was issued for your booking',
			paragraphs: [
				`Hi ${booking.guestName},`,
				cancelled
					? `We refunded your booking ${booking.confirmationId} in full, so it is now cancelled.`
					: `We issued a partial refund for your booking ${booking.confirmationId}. Your booking is still confirmed.`,
				REFUND_TIMING,
			],
		},
		admin: {
			subject: `Refund in Stripe: ${booking.confirmationId} (${status})`,
			preview: `Refund of ${amount} on ${booking.confirmationId}`,
			heading: 'A refund was made in the Stripe Dashboard',
			paragraphs: [
				cancelled
					? 'The payment was refunded in full, so the booking was cancelled and its dates are free again.'
					: 'The payment was partly refunded. The booking stays confirmed.',
			],
		},
	});
}

/** A delayed payment (bank debit) failed: the hold was released. */
export function sendPaymentFailedEmail(
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
): Promise<EmailResult> {
	return sendBatch(
		env,
		`payment failed ${booking.confirmationId}`,
		[
			bookingNotice(
				EMAIL_FROM_BOOKINGS,
				[booking.guestEmail],
				`Payment not completed - ${booking.confirmationId} | Irishette Bed & Breakfast`,
				{
					preview: `Your payment for booking ${booking.confirmationId} did not go through`,
					heading: 'Your payment did not go through',
					paragraphs: [
						`Hi ${booking.guestName},`,
						'Your bank reported that the payment for this booking failed, so we could not confirm your stay and the dates were released. You have not been charged.',
						'You are welcome to book again with another payment method.',
					],
					booking: emailBookingDetails(booking, room),
					button: { label: 'Book again', href: `${env.BETTER_AUTH_URL}/` },
				},
			),
		],
		`payment-failed/${booking.id}`,
	);
}

/** An alert for all admins (sync problems, conflicts, automatic refunds). */
export async function sendAdminAlert(
	db: Database,
	env: EmailEnv,
	alert: {
		subject: string;
		heading: string;
		paragraphs: string[];
		details?: Array<{ label: string; value: string }>;
		link?: { label: string; path: string };
		idempotencyKey?: string;
	},
): Promise<EmailResult> {
	const adminEmails = await getAdminEmails(db);
	if (adminEmails.length === 0) return { success: true };
	return sendBatch(
		env,
		`admin alert: ${alert.subject}`,
		[
			notification(EMAIL_FROM_ADMIN, adminEmails, alert.subject, {
				preview: alert.subject,
				heading: alert.heading,
				paragraphs: alert.paragraphs,
				details: alert.details,
				button: alert.link
					? {
							label: alert.link.label,
							href: `${env.BETTER_AUTH_URL}${alert.link.path}`,
						}
					: undefined,
				tone: 'alert',
			}),
		],
		alert.idempotencyKey,
	);
}

/** A contact form submission, for CONTACT_EMAIL (the admin's own inbox). */
export interface ContactNotification {
	name: string;
	email: string;
	phone?: string;
	subject: string;
	message: string;
	bookingConfirmationId?: string;
	/** Admin dashboard path of the matching notification, when stored. */
	inboxPath?: string;
}

/**
 * Emails a contact form submission to CONTACT_EMAIL with the guest as
 * reply-to, so "Reply" in the admin's mail client answers the guest. Nothing
 * goes to the guest. Logs never include the message or the guest's email.
 */
export function sendContactNotification(
	env: EmailEnv,
	contact: ContactNotification,
): Promise<EmailResult> {
	const details = [
		{ label: 'Name', value: contact.name },
		{ label: 'Email', value: contact.email },
		...(contact.phone ? [{ label: 'Phone', value: contact.phone }] : []),
		...(contact.bookingConfirmationId
			? [{ label: 'Booking', value: contact.bookingConfirmationId }]
			: []),
	];
	return sendBatch(env, 'contact form', [
		{
			...notification(
				EMAIL_FROM_ADMIN,
				[CONTACT_EMAIL],
				`Contact form: ${contact.subject}`,
				{
					preview: `${contact.name}: ${contact.subject}`,
					heading: contact.subject,
					paragraphs: [
						`${contact.name} sent a message through the contact form. Reply to this email to answer them.`,
						...contact.message
							.split(/\r?\n\s*\r?\n/)
							.map((p) => p.trim())
							.filter(Boolean),
					],
					details,
					button: contact.inboxPath
						? {
								label: 'Open in dashboard',
								href: `${env.BETTER_AUTH_URL}${contact.inboxPath}`,
							}
						: undefined,
				},
			),
			replyTo: contact.email,
		},
	]);
}

// --- Better Auth emails ------------------------------------------------------
// Called from Better Auth hooks (src/lib/auth.ts). They throw on failure so
// Better Auth reports the error to the user instead of claiming success.

type AuthEmailEnv = Pick<EmailEnv, 'RESEND_API_KEY'>;

async function sendAuthEmail(
	env: AuthEmailEnv,
	kind: string,
	email: CreateEmailOptions,
): Promise<void> {
	const result = await sendBatch(env, kind, [email]);
	if (!result.success) {
		throw new Error(result.error ?? 'Email delivery failed');
	}
}

export function sendPasswordResetEmail(
	env: AuthEmailEnv,
	to: string,
	url: string,
): Promise<void> {
	return sendAuthEmail(env, 'password reset', {
		from: EMAIL_FROM_AUTH,
		to: [to],
		subject: 'Password Reset',
		react: React.createElement(PasswordReset, {
			url,
			contactEmail: CONTACT_EMAIL,
			expiresIn: formatLinkLifetime(PASSWORD_RESET_EXPIRES_IN),
		}),
	});
}

export function sendMagicLinkEmail(
	env: AuthEmailEnv,
	to: string,
	url: string,
): Promise<void> {
	return sendAuthEmail(env, 'magic link', {
		from: EMAIL_FROM_AUTH,
		to: [to],
		subject: 'Login to Irishette',
		react: React.createElement(MagicLinkEmail, {
			url,
			contactEmail: CONTACT_EMAIL,
			expiresIn: formatLinkLifetime(MAGIC_LINK_EXPIRES_IN),
		}),
	});
}

export function sendVerificationEmail(
	env: AuthEmailEnv,
	to: string,
	url: string,
): Promise<void> {
	return sendAuthEmail(
		env,
		'email verification',
		notification(EMAIL_FROM_AUTH, [to], 'Verify your email | Irishette', {
			preview: 'Verify your email address',
			heading: 'Verify your email',
			paragraphs: [
				'Click the button below to verify your email address for your Irishette account.',
				`This link expires in ${formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)}.`,
				'If you did not request this, you can ignore this email.',
			],
			button: { label: 'Verify email', href: url },
		}),
	);
}

/** Sent to the current address when a verified user changes their email. */
export function sendChangeEmailConfirmation(
	env: AuthEmailEnv,
	to: string,
	newEmail: string,
	url: string,
): Promise<void> {
	return sendAuthEmail(
		env,
		'email change confirmation',
		notification(
			EMAIL_FROM_AUTH,
			[to],
			'Confirm your email change | Irishette',
			{
				preview: 'Confirm your new email address',
				heading: 'Confirm your email change',
				paragraphs: [
					`Someone asked to change the email on your Irishette account to ${newEmail}.`,
					'If this was you, confirm below. If not, ignore this email and your account stays unchanged.',
					`This link expires in ${formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)}.`,
				],
				button: { label: 'Confirm change', href: url },
			},
		),
	);
}
