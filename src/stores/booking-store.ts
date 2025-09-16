import { Store } from '@tanstack/react-store';

export type BookingStep =
	| 'dates'
	| 'auth'
	| 'details'
	| 'payment'
	| 'confirmation';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface PricingBreakdown {
	basePrice: number;
	nights: number;
	subtotal: number;
	taxes: number;
	fees: number;
	totalAmount: number;
	currency: string;
}

export interface GuestInfo {
	name: string;
	email: string;
	phone: string;
	specialRequests?: string;
}

export interface BillingAddress {
	line1: string;
	line2?: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
}

export interface BookingState {
	// Room and dates
	roomId: string | null;
	roomSlug: string | null;
	checkInDate: string | null; // ISO date string
	checkOutDate: string | null; // ISO date string
	guestCount: number;

	// Pricing
	pricing: PricingBreakdown | null;

	// Guest information
	guestInfo: GuestInfo | null;

	// Billing information
	billingAddress: BillingAddress | null;

	// Flow control
	currentStep: BookingStep;

	// Booking ID once created
	bookingId: string | null;

	// Error handling
	error: string | null;
	isLoading: boolean;

	// Metadata
	createdAt: string | null;
	updatedAt: string | null;
}

const STORAGE_KEY = 'irishette-booking-draft';

// Default state
const initialState: BookingState = {
	roomId: null,
	roomSlug: null,
	checkInDate: null,
	checkOutDate: null,
	guestCount: 1,
	pricing: null,
	guestInfo: null,
	billingAddress: null,
	currentStep: 'dates',
	bookingId: null,
	error: null,
	isLoading: false,
	createdAt: null,
	updatedAt: null,
};

// Load persisted state from localStorage
function loadPersistedState(): BookingState {
	if (typeof window === 'undefined') {
		return initialState;
	}

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return initialState;

		const parsed = JSON.parse(stored) as BookingState;

		// Validate that the stored state has required fields
		if (!parsed || typeof parsed !== 'object') {
			return initialState;
		}

		// Return merged state with any new fields from initialState
		return {
			...initialState,
			...parsed,
			// Reset loading state and errors on page load
			isLoading: false,
			error: null,
			updatedAt: new Date().toISOString(),
		};
	} catch (error) {
		console.warn('Failed to load booking state from localStorage:', error);
		return initialState;
	}
}

// Create the store with persisted state
const bookingStore = new Store(loadPersistedState());

// Subscribe to store changes and persist to localStorage
bookingStore.subscribe(() => {
	if (typeof window === 'undefined') return;

	try {
		const state = bookingStore.state;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.warn('Failed to persist booking state to localStorage:', error);
	}
});

// Store actions/utilities
export const bookingActions = {
	// Set room and initial dates
	setRoom: (roomId: string, roomSlug: string) => {
		bookingStore.setState((state) => ({
			...state,
			roomId,
			roomSlug,
			currentStep: 'dates',
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set booking dates
	setDates: (checkInDate: string, checkOutDate: string) => {
		bookingStore.setState((state) => ({
			...state,
			checkInDate,
			checkOutDate,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set guest count
	setGuestCount: (count: number) => {
		bookingStore.setState((state) => ({
			...state,
			guestCount: Math.max(1, count),
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set pricing information
	setPricing: (pricing: PricingBreakdown) => {
		bookingStore.setState((state) => ({
			...state,
			pricing,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set guest information
	setGuestInfo: (guestInfo: GuestInfo) => {
		bookingStore.setState((state) => ({
			...state,
			guestInfo,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set billing address
	setBillingAddress: (billingAddress: BillingAddress) => {
		bookingStore.setState((state) => ({
			...state,
			billingAddress,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Navigate to a specific step
	setStep: (step: BookingStep) => {
		bookingStore.setState((state) => ({
			...state,
			currentStep: step,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set booking ID after creation
	setBookingId: (bookingId: string) => {
		bookingStore.setState((state) => ({
			...state,
			bookingId,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set loading state
	setLoading: (isLoading: boolean) => {
		bookingStore.setState((state) => ({
			...state,
			isLoading,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Set error
	setError: (error: string | null) => {
		bookingStore.setState((state) => ({
			...state,
			error,
			isLoading: false,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Clear error
	clearError: () => {
		bookingStore.setState((state) => ({
			...state,
			error: null,
			updatedAt: new Date().toISOString(),
		}));
	},

	// Reset entire booking state
	reset: () => {
		bookingStore.setState({
			...initialState,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		// Also clear from localStorage
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
	},

	// Check if booking has required information for each step
	canProceedToAuth: () => {
		const state = bookingStore.state;
		return !!(
			state.roomId &&
			state.checkInDate &&
			state.checkOutDate &&
			state.guestCount > 0
		);
	},

	canProceedToDetails: () => {
		const state = bookingStore.state;
		return bookingActions.canProceedToAuth() && state.currentStep !== 'dates';
	},

	canProceedToPayment: () => {
		const state = bookingStore.state;
		return !!(
			bookingActions.canProceedToDetails() &&
			state.guestInfo?.name &&
			state.guestInfo?.email &&
			state.pricing
		);
	},

	// Check if can proceed to confirmation (after payment)
	canProceedToConfirmation: () => {
		const state = bookingStore.state;
		return !!(
			bookingActions.canProceedToPayment() &&
			state.billingAddress?.line1 &&
			state.billingAddress?.city &&
			state.billingAddress?.state &&
			state.billingAddress?.postalCode &&
			state.billingAddress?.country
		);
	},

	// Get current booking summary
	getBookingSummary: () => {
		const state = bookingStore.state;

		if (!bookingActions.canProceedToAuth()) {
			return null;
		}

		return {
			roomId: state.roomId as string,
			roomSlug: state.roomSlug as string,
			checkInDate: state.checkInDate as string,
			checkOutDate: state.checkOutDate as string,
			guestCount: state.guestCount,
			pricing: state.pricing,
			guestInfo: state.guestInfo,
			totalNights:
				state.checkInDate && state.checkOutDate
					? Math.ceil(
							(new Date(state.checkOutDate).getTime() -
								new Date(state.checkInDate).getTime()) /
								(1000 * 60 * 60 * 24),
						)
					: 0,
		};
	},

	// Initialize a new booking session
	initializeBooking: (roomId: string, roomSlug: string) => {
		bookingStore.setState({
			...initialState,
			roomId,
			roomSlug,
			currentStep: 'dates',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
	},
};

// Export store for direct access
export { bookingStore };
