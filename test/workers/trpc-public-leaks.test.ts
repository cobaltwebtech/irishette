import { beforeAll, describe, expect, it } from 'vitest';
import { caller, insertBooking, insertFeed } from './helpers';
import { ROSE } from './seed';

// Public outputs must not contain: feed URLs (third-party secrets), the iCal
// export token, guest personal data, or other guests' booking ids and
// confirmation ids.

const FEED_URL = 'https://feeds.example.test/secret-feed-token.ics';

/** Every string anywhere in a value. */
function strings(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (value instanceof Date || value === null || typeof value !== 'object') {
		return [];
	}
	return Object.values(value).flatMap(strings);
}

function keys(value: unknown): string[] {
	if (value === null || typeof value !== 'object' || value instanceof Date) {
		return [];
	}
	return Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]);
}

let booking: Awaited<ReturnType<typeof insertBooking>>;

beforeAll(async () => {
	await insertFeed({ url: FEED_URL });
	booking = await insertBooking({
		checkInDate: '2036-01-10',
		checkOutDate: '2036-01-12',
		guestName: 'Secret Guest Name',
		guestEmail: 'secret.guest@example.test',
		guestPhone: '5555559999',
		specialRequests: 'Secret request',
	});
});

function expectNoSecrets(output: unknown) {
	const all = strings(output);
	expect(all).not.toContain(FEED_URL);
	expect(all).not.toContain(ROSE.icalExportToken);
	expect(all).not.toContain(booking.guestName);
	expect(all).not.toContain(booking.guestEmail);
	expect(all).not.toContain(booking.guestPhone);
	expect(all).not.toContain(booking.id);
	expect(all).not.toContain(booking.publicId);
	expect(all).not.toContain(booking.confirmationId);
	expect(keys(output)).not.toContain('icalExportToken');
}

describe('public procedure outputs', () => {
	it('rooms.list', async () => {
		expectNoSecrets(await caller(null).rooms.list({}));
	});

	it('rooms.get', async () => {
		expectNoSecrets(await caller(null).rooms.get({ publicId: ROSE.publicId }));
	});

	it('rooms.calculatePricing', async () => {
		expectNoSecrets(
			await caller(null).rooms.calculatePricing({
				roomId: ROSE.id,
				checkInDate: '2036-02-01',
				checkOutDate: '2036-02-03',
				guestCount: 1,
			}),
		);
	});

	it.fails('availability.getBySlug returns date ranges only (no booking ids)', async () => {
		const output = await caller(null).availability.getBySlug({
			roomSlug: ROSE.slug,
			startDate: '2036-01-01',
			endDate: '2036-01-31',
		});
		expectNoSecrets(output);
	});

	it.fails('rooms.getIcalConfig does not return feed URLs to the public', async () => {
		const output = await caller(null)
			.rooms.getIcalConfig({ roomId: ROSE.id })
			.catch(() => null);
		expectNoSecrets(output);
		// It must also not succeed for anonymous callers at all.
		expect(output).toBeNull();
	});

	it.fails('rooms.generateIcal is not public', async () => {
		const output = await caller(null)
			.rooms.generateIcal({ roomId: ROSE.id })
			.catch(() => null);
		expect(output).toBeNull();
	});
});
