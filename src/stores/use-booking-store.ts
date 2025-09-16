import { useStore } from '@tanstack/react-store';
import {
	type BookingState,
	type BookingStep,
	bookingActions,
	bookingStore,
} from './booking-store';

/**
 * Custom hook for accessing and managing booking state
 * Provides reactive access to the booking store with helpful utilities
 */
export function useBookingStore() {
	// Get reactive state from the store
	const state = useStore(bookingStore);

	// Helper to check if we're on a specific step
	const isStep = (step: BookingStep) => state.currentStep === step;

	// Helper to check if we can proceed to next step
	const canProceed = () => {
		switch (state.currentStep) {
			case 'dates':
				return bookingActions.canProceedToAuth();
			case 'auth':
				return bookingActions.canProceedToDetails();
			case 'details':
				return bookingActions.canProceedToPayment();
			case 'payment':
			case 'confirmation':
				return true;
			default:
				return false;
		}
	};

	// Helper to get next step
	const getNextStep = (): BookingStep | null => {
		switch (state.currentStep) {
			case 'dates':
				return 'auth';
			case 'auth':
				return 'details';
			case 'details':
				return 'payment';
			case 'payment':
				return 'confirmation';
			case 'confirmation':
				return null;
			default:
				return null;
		}
	};

	// Helper to go to next step (if valid)
	const proceedToNext = () => {
		const nextStep = getNextStep();
		if (nextStep && canProceed()) {
			bookingActions.setStep(nextStep);
			return true;
		}
		return false;
	};

	// Helper to get validation errors for current step
	const getValidationErrors = (): string[] => {
		const errors: string[] = [];

		switch (state.currentStep) {
			case 'dates':
				if (!state.roomId) errors.push('Room must be selected');
				if (!state.checkInDate) errors.push('Check-in date is required');
				if (!state.checkOutDate) errors.push('Check-out date is required');
				if (state.guestCount < 1) errors.push('At least 1 guest is required');
				if (
					state.checkInDate &&
					state.checkOutDate &&
					new Date(state.checkInDate) >= new Date(state.checkOutDate)
				) {
					errors.push('Check-out date must be after check-in date');
				}
				break;

			case 'details':
				if (!state.guestInfo?.name) errors.push('Guest name is required');
				if (!state.guestInfo?.email) errors.push('Guest email is required');
				if (!state.pricing) errors.push('Pricing information is missing');
				break;

			case 'payment':
				if (!state.bookingId) errors.push('Booking must be created first');
				break;
		}

		return errors;
	};

	// Helper to check if booking is in progress
	const hasActiveBooking = () => {
		return !!(
			state.roomId ||
			state.checkInDate ||
			state.checkOutDate ||
			state.bookingId
		);
	};

	// Helper to get formatted date range
	const getDateRange = () => {
		if (!state.checkInDate || !state.checkOutDate) return null;

		const checkIn = new Date(state.checkInDate);
		const checkOut = new Date(state.checkOutDate);

		return {
			checkIn,
			checkOut,
			nights: Math.ceil(
				(checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
			),
			formatted: {
				checkIn: checkIn.toLocaleDateString(),
				checkOut: checkOut.toLocaleDateString(),
			},
		};
	};

	return {
		// Current state
		...state,

		// Actions
		actions: bookingActions,

		// Computed values
		isValid: {
			dates: bookingActions.canProceedToAuth(),
			auth: bookingActions.canProceedToDetails(),
			details: bookingActions.canProceedToPayment(),
		},

		// Current booking summary (null if not ready)
		summary: bookingActions.getBookingSummary(),

		// Helper functions
		isStep,
		canProceed,
		getNextStep,
		proceedToNext,
		getValidationErrors,
		hasActiveBooking,
		getDateRange,
	};
}

/**
 * Hook to access only the booking actions (for components that only need to update state)
 */
export function useBookingActions() {
	return bookingActions;
}

/**
 * Hook to access only specific parts of the booking state (for performance optimization)
 */
export function useBookingSelector<T>(selector: (state: BookingState) => T) {
	const state = useStore(bookingStore);
	return selector(state);
}
