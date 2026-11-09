import { useMutation } from '@tanstack/react-query';

import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';

/**
 * `bookings.resendConfirmationEmail` with success/error toasts. The server
 * decides who may resend (the booking's guest or an admin; confirmed
 * bookings only).
 */
export function useResendConfirmationEmail(successDescription: string) {
	const trpc = useTRPC();
	return useMutation(
		trpc.bookings.resendConfirmationEmail.mutationOptions({
			onSuccess: (result) => {
				toast.add({
					type: 'success',
					title: 'Email sent successfully!',
					description: result.message || successDescription,
				});
			},
			onError: (error) => {
				console.error('Failed to resend confirmation email:', error);
				toast.add({
					type: 'error',
					title: 'Failed to send email',
					description:
						error.message ||
						'Unable to send confirmation email. Please try again.',
				});
			},
		}),
	);
}
