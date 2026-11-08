import React from 'react';
import { type CreateEmailOptions, Resend } from 'resend';

import { AdminBookingNotificationEmail } from '@/components/email/AdminBookingNotificationEmail';
import { BookingConfirmationEmail } from '@/components/email/BookingConfirmationEmail';
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
import {
	CHECK_OUT_TIME_LABEL,
	CONTACT_EMAIL,
	EMAIL_FROM_ADMIN,
	EMAIL_FROM_AUTH,
	EMAIL_FROM_BOOKINGS,
	SITE_URL,
} from './site';

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

const currency = (amount: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
		amount,
	);

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
			confirmationId: booking.confirmationId,
			guestName: booking.guestName,
			roomName: room.name,
			checkInDate: booking.checkInDate,
			checkOutDate: booking.checkOutDate,
			numberOfNights: booking.numberOfNights,
			numberOfGuests: booking.numberOfGuests,
			guestEmail: booking.guestEmail,
			guestPhone: booking.guestPhone ?? undefined,
			specialRequests: booking.specialRequests ?? undefined,
			baseAmount: booking.baseAmount,
			taxAmount: booking.taxAmount ?? 0,
			feesAmount: booking.feesAmount ?? 0,
			totalAmount: booking.totalAmount,
			accountUrl: `${baseUrl}/account`,
			siteUrl: SITE_URL,
			contactEmail: CONTACT_EMAIL,
			checkOutTime: CHECK_OUT_TIME_LABEL,
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

/** Guest cancellation notice + admin notification. */
export async function sendCancellationEmails(
	db: Database,
	env: EmailEnv,
	booking: Booking,
	room: RoomInfo,
	info: CancellationEmailInfo,
): Promise<EmailResult> {
	const details = [
		{ label: 'Confirmation', value: booking.confirmationId },
		{ label: 'Room', value: room.name },
		{ label: 'Check-in', value: booking.checkInDate },
		{ label: 'Check-out', value: booking.checkOutDate },
		{ label: 'Amount paid', value: currency(booking.totalAmount) },
		{ label: 'Refund', value: currency(info.refundAmount) },
	];
	const emails = [
		notification(
			EMAIL_FROM_BOOKINGS,
			[booking.guestEmail],
			`Booking Cancelled - ${booking.confirmationId} | Irishette Bed & Breakfast`,
			{
				preview: `Your booking ${booking.confirmationId} was cancelled`,
				heading: 'Your booking was cancelled',
				paragraphs: [
					`Hi ${booking.guestName},`,
					info.guestMessage,
					info.refundAmount > 0
						? 'Refunds go back to your original payment method. Please allow 3-5 business days for it to appear.'
						: 'No refund is due for this cancellation under our cancellation policy.',
				],
				details,
				button: {
					label: 'View your bookings',
					href: `${env.BETTER_AUTH_URL}/account`,
				},
			},
		),
	];
	const adminEmails = await getAdminEmails(db);
	if (adminEmails.length > 0) {
		emails.push(
			notification(
				EMAIL_FROM_ADMIN,
				adminEmails,
				`Booking Cancelled: ${booking.confirmationId} (${info.cancelledBy})`,
				{
					preview: `Booking ${booking.confirmationId} was cancelled`,
					heading: 'Booking cancelled',
					paragraphs: [info.adminMessage],
					details: [{ label: 'Guest', value: booking.guestName }, ...details],
					button: {
						label: 'Open booking',
						href: `${env.BETTER_AUTH_URL}/admin/bookings/${booking.publicId}`,
					},
					tone: 'alert',
				},
			),
		);
	}
	return sendBatch(
		env,
		`booking cancelled ${booking.confirmationId}`,
		emails,
		`booking-cancelled/${booking.id}`,
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
