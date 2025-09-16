import { createServerFileRoute } from '@tanstack/react-start/server';
import {
	type BookingEmailData,
	sendBookingConfirmationEmail,
} from '@/lib/email-service';
import { getBindings } from '@/utils/bindings';

export const ServerRoute = createServerFileRoute(
	'/api/send-confirmation-email/$',
).methods({
	POST: async ({ request }: { request: Request }) => {
		try {
			// Parse request body to get the booking email data
			const emailData = (await request.json()) as BookingEmailData;

			// Get Cloudflare bindings for environment variables
			const bindings = getBindings();

			// Send the confirmation email
			const emailResult = await sendBookingConfirmationEmail(emailData, {
				RESEND_API_KEY: bindings.RESEND_API_KEY,
			});

			if (emailResult.success) {
				return new Response(
					JSON.stringify({
						success: true,
						message: 'Confirmation email sent successfully',
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					},
				);
			} else {
				return new Response(
					JSON.stringify({
						success: false,
						error: emailResult.error || 'Failed to send email',
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					},
				);
			}
		} catch (error) {
			console.error('Error sending confirmation email:', error);
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Internal server error',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}
	},
});
