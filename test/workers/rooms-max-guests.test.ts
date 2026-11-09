import { describe, expect, it } from 'vite-plus/test';

import { bookingInput, caller, trpcError, useClock } from './helpers';
import { TEXAS } from './seed';

describe('room max guests', () => {
	useClock('2034-12-20T17:00:00Z');

	it('an admin can update maxGuests', async () => {
		const updated = await caller('admin').rooms.update({
			id: TEXAS.id,
			maxGuests: 4,
		});
		expect(updated.maxGuests).toBe(4);
	});

	it('rejects maxGuests outside 1-10', async () => {
		await trpcError(
			caller('admin').rooms.update({ id: TEXAS.id, maxGuests: 0 }),
		);
		await trpcError(
			caller('admin').rooms.update({ id: TEXAS.id, maxGuests: 11 }),
		);
	});

	it('a normal user cannot update maxGuests', async () => {
		const error = await trpcError(
			caller('user').rooms.update({ id: TEXAS.id, maxGuests: 8 }),
		);
		expect(error.code).toBe('FORBIDDEN');
	});

	it('rejects a booking above the room maximum', async () => {
		await caller('admin').rooms.update({ id: TEXAS.id, maxGuests: 2 });
		const error = await trpcError(
			caller('user').bookings.createBooking(
				bookingInput({
					roomId: TEXAS.id,
					checkInDate: '2035-01-10',
					checkOutDate: '2035-01-12',
					guestCount: 3,
				}),
			),
		);
		expect(error.code).toBe('BAD_REQUEST');
	});

	it('accepts a booking at the room maximum', async () => {
		await caller('admin').rooms.update({ id: TEXAS.id, maxGuests: 2 });
		await expect(
			caller('user').bookings.createBooking(
				bookingInput({
					roomId: TEXAS.id,
					checkInDate: '2035-02-10',
					checkOutDate: '2035-02-12',
					guestCount: 2,
				}),
			),
		).resolves.toMatchObject({ success: true });
	});

	it('public room data exposes maxGuests for the guest picker', async () => {
		const room = await caller(null).rooms.get({ publicId: TEXAS.publicId });
		expect(room.maxGuests).toBeTypeOf('number');
	});
});
