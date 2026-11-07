// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'irishette-booking-draft';

// The store reads localStorage when the module loads, so each test imports a
// fresh copy after arranging storage.
async function loadStore() {
	vi.resetModules();
	return import('@/stores/booking-store');
}

beforeEach(() => {
	localStorage.clear();
});

describe('booking store', () => {
	it('starts empty and cannot proceed', async () => {
		const { bookingActions, bookingStore } = await loadStore();
		expect(bookingStore.state.currentStep).toBe('dates');
		expect(bookingActions.canProceedToAuth()).toBe(false);
		expect(bookingActions.getBookingSummary()).toBeNull();
	});

	it('canProceed* follow the steps', async () => {
		const { bookingActions } = await loadStore();
		bookingActions.initializeBooking('room-1', 'rose-room', 'Rose Room');
		bookingActions.setDates('2030-07-01', '2030-07-04');
		expect(bookingActions.canProceedToAuth()).toBe(true);
		// Still on the dates step.
		expect(bookingActions.canProceedToDetails()).toBe(false);

		bookingActions.setStep('details');
		expect(bookingActions.canProceedToDetails()).toBe(true);
		expect(bookingActions.canProceedToPayment()).toBe(false);

		bookingActions.setGuestInfo({
			name: 'Ada',
			email: 'ada@example.test',
			phone: '5555550100',
		});
		bookingActions.setPricing({
			basePrice: 100,
			nights: 3,
			subtotal: 300,
			taxes: 39,
			fees: 36,
			totalAmount: 375,
			currency: 'usd',
		});
		expect(bookingActions.canProceedToPayment()).toBe(true);
	});

	it('counts nights from the dates', async () => {
		const { bookingActions } = await loadStore();
		bookingActions.initializeBooking('room-1', 'rose-room');
		// Spans the US DST change; still 3 nights.
		bookingActions.setDates('2030-03-09', '2030-03-12');
		expect(bookingActions.getBookingSummary()?.totalNights).toBe(3);
	});

	it('keeps at least one guest', async () => {
		const { bookingActions, bookingStore } = await loadStore();
		bookingActions.setGuestCount(0);
		expect(bookingStore.state.guestCount).toBe(1);
	});

	// Phase 7.3: the store clamps the guest count to the room's max_guests.
	it.fails('clamps guests to the room maximum', async () => {
		const { bookingActions, bookingStore } = await loadStore();
		// Planned signature: initializeBooking(roomId, slug, name, maxGuests).
		const initialize = bookingActions.initializeBooking as (
			...args: unknown[]
		) => void;
		initialize('room-1', 'rose-room', 'Rose Room', 2);
		bookingActions.setGuestCount(5);
		expect(bookingStore.state.guestCount).toBe(2);
	});

	it('persists to localStorage and restores on load', async () => {
		const first = await loadStore();
		first.bookingActions.initializeBooking('room-1', 'rose-room', 'Rose Room');
		first.bookingActions.setDates('2030-07-01', '2030-07-04');
		first.bookingActions.setBookingId('booking-1', 'pub0000000000001');
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject(
			{ roomId: 'room-1', bookingPublicId: 'pub0000000000001' },
		);

		const second = await loadStore();
		expect(second.bookingStore.state).toMatchObject({
			roomId: 'room-1',
			checkInDate: '2030-07-01',
			checkOutDate: '2030-07-04',
			bookingId: 'booking-1',
			bookingPublicId: 'pub0000000000001',
			isLoading: false,
			error: null,
		});
	});

	it('fills fields missing from an old draft with defaults', async () => {
		// A draft saved before bookingPublicId existed (Phase 5 issue 5).
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ roomId: 'room-1', bookingId: 'booking-1' }),
		);
		const { bookingStore } = await loadStore();
		expect(bookingStore.state.bookingId).toBe('booking-1');
		expect(bookingStore.state.bookingPublicId).toBeNull();
	});

	it('reset clears state and storage', async () => {
		const { bookingActions, bookingStore } = await loadStore();
		bookingActions.initializeBooking('room-1', 'rose-room');
		bookingActions.reset();
		expect(bookingStore.state.roomId).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
