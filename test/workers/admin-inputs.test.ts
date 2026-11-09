import { describe, expect, it } from 'vite-plus/test';

import { caller, insertBooking, trpcError } from './helpers';
import { ROSE } from './seed';

// Admin list inputs are validated with the shared schemas (ISO dates, UUID ids).

const admin = () => caller('admin');

describe('bookings.adminListBookings', () => {
	it('rejects a malformed room id or date', async () => {
		for (const input of [
			{ roomId: 'not-an-id' },
			{ startDate: '2030-13-01' },
			{ endDate: 'yesterday' },
		]) {
			const error = await trpcError(admin().bookings.adminListBookings(input));
			expect(error.code).toBe('BAD_REQUEST');
		}
	});

	it('filters by either date bound alone', async () => {
		const early = await insertBooking({
			checkInDate: '2031-01-10',
			checkOutDate: '2031-01-11',
		});
		const late = await insertBooking({
			checkInDate: '2031-03-10',
			checkOutDate: '2031-03-11',
		});
		const fromFeb = await admin().bookings.adminListBookings({
			limit: 100,
			startDate: '2031-02-01',
		});
		const ids = fromFeb.map((r) => r.booking.id);
		expect(ids).toContain(late.id);
		expect(ids).not.toContain(early.id);

		const untilFeb = await admin().bookings.adminListBookings({
			limit: 100,
			endDate: '2031-02-01',
			roomId: ROSE.id,
		});
		const untilIds = untilFeb.map((r) => r.booking.id);
		expect(untilIds).toContain(early.id);
		expect(untilIds).not.toContain(late.id);
	});
});

describe('ical.getSyncLogs', () => {
	it('rejects malformed ids', async () => {
		for (const input of [{ roomId: 'x' }, { feedId: 'x' }]) {
			const error = await trpcError(admin().ical.getSyncLogs(input));
			expect(error.code).toBe('BAD_REQUEST');
		}
		await expect(
			admin().ical.getSyncLogs({ roomId: ROSE.id }),
		).resolves.toMatchObject({ logs: [] });
	});
});
