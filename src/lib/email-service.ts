import React from 'react';
import { Resend } from 'resend';
import { AdminBookingNotificationEmail } from '@/components/email/AdminBookingNotificationEmail';
import { BookingConfirmationEmail } from '@/components/email/BookingConfirmationEmail';

interface EmailEnv {
	RESEND_API_KEY: string;
}

export interface BookingEmailData {
	confirmationId: string;
	guestName: string;
	guestEmail: string;
	guestPhone?: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	specialRequests?: string;
	baseAmount: number;
	taxAmount: number;
	feesAmount: number;
	totalAmount: number;
	baseUrl: string;
}

export interface AdminNotificationEmailData {
	confirmationId: string;
	guestName: string;
	guestEmail: string;
	guestPhone?: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	specialRequests?: string;
	totalAmount: number;
	baseUrl: string;
}

/**
 * Send booking confirmation email using Resend
 */
export async function sendBookingConfirmationEmail(
	emailData: BookingEmailData,
	env: EmailEnv,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!env.RESEND_API_KEY) {
			console.error('RESEND_API_KEY environment variable is not set');
			return { success: false, error: 'Email service not configured' };
		}

		// Initialize Resend
		const resend = new Resend(env.RESEND_API_KEY);

		// Send email using React component
		const { data, error } = await resend.emails.send({
			from: 'Irishette <bookings@contact.cobaltweb.tech>',
			to: [emailData.guestEmail],
			subject: `Booking Confirmed - ${emailData.confirmationId} | Irishette Bed & Breakfast`,
			react: React.createElement(BookingConfirmationEmail, {
				confirmationId: emailData.confirmationId,
				guestName: emailData.guestName,
				roomName: emailData.roomName,
				checkInDate: emailData.checkInDate,
				checkOutDate: emailData.checkOutDate,
				numberOfNights: emailData.numberOfNights,
				numberOfGuests: emailData.numberOfGuests,
				guestEmail: emailData.guestEmail,
				guestPhone: emailData.guestPhone,
				specialRequests: emailData.specialRequests,
				baseAmount: emailData.baseAmount,
				taxAmount: emailData.taxAmount,
				feesAmount: emailData.feesAmount,
				totalAmount: emailData.totalAmount,
				accountUrl: `${emailData.baseUrl}/account`,
			}),
		});

		if (error) {
			console.error('Failed to send booking confirmation email:', error);
			return {
				success: false,
				error: `Email delivery failed: ${error.message}`,
			};
		}

		console.log('Booking confirmation email sent successfully:', {
			emailId: data?.id,
			recipient: emailData.guestEmail,
			confirmationId: emailData.confirmationId,
		});

		return { success: true };
	} catch (error) {
		console.error('Error sending booking confirmation email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Validate email service configuration
 */
export function validateEmailService(env: EmailEnv): {
	isConfigured: boolean;
	error?: string;
} {
	if (!env.RESEND_API_KEY) {
		return {
			isConfigured: false,
			error: 'RESEND_API_KEY environment variable is required',
		};
	}

	return { isConfigured: true };
}

/**
 * Send admin notification email for new bookings
 */
export async function sendAdminBookingNotification(
	emailData: AdminNotificationEmailData,
	adminEmails: string[],
	env: EmailEnv,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!env.RESEND_API_KEY) {
			console.error('RESEND_API_KEY environment variable is not set');
			return { success: false, error: 'Email service not configured' };
		}

		if (adminEmails.length === 0) {
			console.warn('No admin emails provided for notification');
			return { success: true }; // Not an error, just no admins to notify
		}

		// Initialize Resend
		const resend = new Resend(env.RESEND_API_KEY);

		// Send email to all admin users
		const { data, error } = await resend.emails.send({
			from: 'Irishette <admin@contact.cobaltweb.tech>',
			to: adminEmails,
			subject: `New Booking Alert: ${emailData.confirmationId} - ${emailData.guestName}`,
			react: React.createElement(AdminBookingNotificationEmail, {
				confirmationId: emailData.confirmationId,
				guestName: emailData.guestName,
				guestEmail: emailData.guestEmail,
				guestPhone: emailData.guestPhone,
				roomName: emailData.roomName,
				checkInDate: emailData.checkInDate,
				checkOutDate: emailData.checkOutDate,
				numberOfNights: emailData.numberOfNights,
				numberOfGuests: emailData.numberOfGuests,
				specialRequests: emailData.specialRequests,
				totalAmount: emailData.totalAmount,
				adminDashboardUrl: `${emailData.baseUrl}/admin`,
			}),
		});

		if (error) {
			console.error('Failed to send admin notification email:', error);
			return {
				success: false,
				error: `Admin email delivery failed: ${error.message}`,
			};
		}

		console.log('Admin notification email sent successfully:', {
			emailId: data?.id,
			recipients: adminEmails,
			confirmationId: emailData.confirmationId,
		});

		return { success: true };
	} catch (error) {
		console.error('Error sending admin notification email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
