import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { useTRPC } from '@/integrations/trpc/react';
import { guestDetailsSchema } from '@/lib/payment-validation';
import { refreshSession, useSession } from '@/lib/session';
import { useBookingStore } from '@/stores';
import {
	type BookingState,
	bookingActions,
	bookingStore,
} from '@/stores/booking-store';
import { isPricingComplete } from '@/utils/booking-utils';

/** The guest details form on the booking details step. */
export interface GuestDetailsForm {
	guestName: string;
	guestEmail: string;
	guestPhone: string;
	numberOfGuests: number;
	specialRequests: string;
}

export type GuestDetailsErrors = Partial<
	Record<keyof GuestDetailsForm, string>
>;

/** Friendlier messages than Zod's defaults for the form fields. */
const FIELD_MESSAGES: GuestDetailsErrors = {
	guestName: 'Please enter your full name (2-100 characters)',
	guestEmail: 'Please enter a valid email address',
	specialRequests: 'Special requests can be at most 1000 characters',
};

/** The server's Zod rules (guestDetailsSchema), with per-field messages. */
export function validateGuestDetails(
	form: GuestDetailsForm,
): GuestDetailsErrors {
	const result = guestDetailsSchema.safeParse({
		guestName: form.guestName,
		guestEmail: form.guestEmail.trim(),
		guestPhone: form.guestPhone,
		guestCount: form.numberOfGuests,
		specialRequests: form.specialRequests || undefined,
	});
	const errors: GuestDetailsErrors = {};
	if (result.success) return errors;
	for (const issue of result.error.issues) {
		const field = String(issue.path[0]);
		const key = (
			field === 'guestCount' ? 'numberOfGuests' : field
		) as keyof GuestDetailsForm;
		errors[key] ??= FIELD_MESSAGES[key] ?? issue.message;
	}
	return errors;
}

/** `createBooking` input from the store, or the message to show instead. */
function holdInput(state: BookingState) {
	const { guestInfo, pricing, roomId, checkInDate, checkOutDate } = state;
	if (!guestInfo || !pricing) {
		console.error('Missing booking information before creating the hold:', {
			hasGuestInfo: !!guestInfo,
			hasPricing: !!pricing,
		});
		return {
			error: 'Missing booking information. Please refresh and try again.',
		};
	}
	if (!roomId || !checkInDate || !checkOutDate) {
		return { error: 'Missing booking dates or room information' };
	}
	if (pricing.totalAmount <= 0) {
		console.error('Invalid total amount:', pricing.totalAmount);
		return { error: 'Invalid booking total. Please refresh and try again.' };
	}
	return {
		input: {
			roomId,
			checkInDate,
			checkOutDate,
			guestCount: state.guestCount,
			guestName: guestInfo.name,
			guestEmail: guestInfo.email,
			guestPhone: guestInfo.phone,
			specialRequests: guestInfo.specialRequests || '',
			basePrice: pricing.basePrice,
			serviceFee: pricing.fees || 0,
			taxAmount: pricing.taxes || 0,
			totalAmount: pricing.totalAmount,
		},
	};
}

/**
 * "Continue to Payment": saves profile changes, stores the guest details,
 * re-prices the stay on the server, creates the booking hold and moves the
 * flow to the payment step. Errors are shown through `booking.error`.
 */
export function useBookingDetailsSubmit() {
	const booking = useBookingStore();
	const session = useSession();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const updateProfile = useMutation(trpc.users.updateProfile.mutationOptions());
	const createBooking = useMutation(
		trpc.bookings.createBooking.mutationOptions(),
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Save a changed name or phone to the signed-in user's profile (one call).
	// A failure (e.g. the phone is used by another account) does not block
	// the booking: the booking keeps the details typed here.
	const saveProfileChanges = async (form: GuestDetailsForm) => {
		if (!session?.user) return;
		const name = form.guestName.trim();
		const phoneNumber = form.guestPhone.trim();
		const changes = {
			...(name !== session.user.name ? { name } : {}),
			...(phoneNumber && phoneNumber !== session.user.phoneNumber
				? { phoneNumber }
				: {}),
		};
		if (Object.keys(changes).length === 0) return;
		try {
			await updateProfile.mutateAsync(changes);
			await refreshSession(queryClient, router);
		} catch (error) {
			console.warn('Failed to update the user profile:', error);
		}
	};

	/**
	 * Precise pricing (fees and taxes) from the server, never a cached result.
	 * Returns false when the flow must stop (the error is already shown).
	 */
	const refreshPricing = async (guestCount: number) => {
		const { roomId, checkInDate, checkOutDate } = bookingStore.state;
		try {
			if (!roomId || !checkInDate || !checkOutDate) {
				throw new Error('Missing required booking information');
			}
			const pricing = await queryClient.fetchQuery(
				trpc.bookings.calculateBooking.queryOptions(
					{ roomId, checkInDate, checkOutDate, guestCount },
					{ staleTime: 0 },
				),
			);
			// Zero fees or taxes are valid; only missing values are not.
			if (!isPricingComplete(pricing)) {
				console.error('Incomplete pricing data from calculateBooking');
				booking.actions.setError(
					'Failed to calculate pricing. Please try again.',
				);
				return false;
			}
			booking.actions.setPricing({
				basePrice: pricing.baseAmount / pricing.numberOfNights,
				nights: pricing.numberOfNights,
				subtotal: pricing.baseAmount,
				taxes: pricing.taxAmount,
				fees: pricing.feesAmount,
				totalAmount: pricing.totalAmount,
				currency: 'USD',
				appliedRules: pricing.appliedRules || [],
				taxBreakdown: pricing.taxBreakdown,
			});
			return true;
		} catch (error) {
			console.error('Failed to calculate detailed pricing:', error);
			// Continue with the existing estimate if there is one.
			if (bookingStore.state.pricing?.totalAmount) {
				console.warn('Using existing pricing data due to calculation error');
				return true;
			}
			booking.actions.setError(
				'Failed to calculate pricing. Please try again or refresh the page.',
			);
			return false;
		}
	};

	/** Creates the booking hold and moves to the payment step. */
	const createHold = async () => {
		if (!session?.user) {
			booking.actions.setError('Please sign in to continue with payment');
			return;
		}
		// Read the store directly: the reactive `booking` may be stale here.
		const hold = holdInput(bookingStore.state);
		if (!hold.input) {
			booking.actions.setError(hold.error);
			return;
		}
		try {
			const result = await createBooking.mutateAsync(hold.input);
			if (!result?.bookingId || !result.publicId) {
				throw new Error('No booking ID returned from server');
			}
			booking.actions.setBookingId(result.bookingId, result.publicId);
			booking.actions.setStep('payment');
		} catch (error) {
			console.error('Booking creation error:', error);
			booking.actions.setError(
				error instanceof Error
					? error.message
					: 'An error occurred while processing your booking',
			);
		}
	};

	const submit = async (form: GuestDetailsForm) => {
		await saveProfileChanges(form);

		booking.actions.setGuestInfo({
			name: form.guestName,
			email: form.guestEmail,
			phone: form.guestPhone,
			specialRequests: form.specialRequests || undefined,
		});
		if (form.numberOfGuests !== booking.guestCount) {
			booking.actions.setGuestCount(form.numberOfGuests);
		}

		setIsSubmitting(true);
		booking.actions.clearError();
		try {
			if (!(await refreshPricing(form.numberOfGuests))) return;
			// canProceedToPayment() reads bookingStore.state, not the
			// possibly stale reactive `booking`.
			if (!bookingActions.canProceedToPayment()) {
				const state = bookingStore.state;
				console.error('Invalid booking state before payment:', {
					hasGuestInfo: !!state.guestInfo,
					hasPricing: !!state.pricing,
					totalAmount: state.pricing?.totalAmount,
				});
				booking.actions.setError(
					'Booking information is incomplete. Please try again.',
				);
				return;
			}
			await createHold();
		} finally {
			setIsSubmitting(false);
		}
	};

	return { submit, isSubmitting };
}
