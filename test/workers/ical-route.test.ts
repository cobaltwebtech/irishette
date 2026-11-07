import { exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import {
	caller,
	insertBlock,
	insertBooking,
	insertExternalEvent,
	insertFeed,
	trpcError,
} from './helpers';
import { ROSE, TEXAS } from './seed';

// Export feed: /api/ical/<room publicId>/<token>.ics. Only our confirmed
// bookings and admin blocks; generic "Reserved" summaries; 404 for any
// mismatch (no room-existence leak).

const exportUrl = (publicId: string, token: string) =>
	`http://localhost/api/ical/${publicId}/${token}.ics`;

const get = (url: string) => exports.default.fetch(new Request(url));

let confirmed: Awaited<ReturnType<typeof insertBooking>>;
let block: Awaited<ReturnType<typeof insertBlock>>;

beforeAll(async () => {
	// Dates near "now" so they fall inside the 30-days-back/2-years-ahead window.
	const inDays = (n: number) =>
		new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
	confirmed = await insertBooking({
		checkInDate: inDays(10),
		checkOutDate: inDays(12),
		guestName: 'Jane O\'Guest, PhD; "VIP"',
		specialRequests: 'BEGIN:VEVENT\r\nSUMMARY:Injected',
	});
	await insertBooking({
		checkInDate: inDays(20),
		checkOutDate: inDays(22),
		status: 'cancelled',
		paymentStatus: 'refunded',
	});
	await insertBooking({
		checkInDate: inDays(24),
		checkOutDate: inDays(25),
		status: 'pending',
		paymentStatus: 'pending',
		expiresAt: new Date(Date.now() + 20 * 60_000),
	});
	block = await insertBlock({
		startDate: inDays(30),
		endDate: inDays(32),
		reason: 'Owner stay',
		notes: 'Private note',
	});
	const feed = await insertFeed();
	await insertExternalEvent({
		feedId: feed.id,
		uid: 'imported@airbnb.test',
		startDate: inDays(40),
		endDate: inDays(42),
	});
});

describe('iCal export access', () => {
	it('serves the feed for the right room and token', async () => {
		const response = await get(exportUrl(ROSE.publicId, ROSE.icalExportToken));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe(
			'text/calendar; charset=utf-8',
		);
		expect(response.headers.get('cache-control')).toBe('private, max-age=300');
	});

	it('returns 404 for a wrong token', async () => {
		const response = await get(exportUrl(ROSE.publicId, 'wrong-token'));
		expect(response.status).toBe(404);
	});

	it('returns 404 for another room’s token', async () => {
		const response = await get(exportUrl(ROSE.publicId, TEXAS.icalExportToken));
		expect(response.status).toBe(404);
	});

	it('returns 404 for an unknown room', async () => {
		const response = await get(
			exportUrl('nosuchroom000000', ROSE.icalExportToken),
		);
		expect(response.status).toBe(404);
	});

	it('no longer serves the feed by internal room id without a token', async () => {
		const response = await get(`http://localhost/api/ical/${ROSE.id}.ics`);
		expect(response.status).toBe(404);
	});
});

describe('iCal export contents', () => {
	async function feedText() {
		const response = await get(exportUrl(ROSE.publicId, ROSE.icalExportToken));
		expect(response.status).toBe(200);
		return response.text();
	}

	it('has the RFC 5545 headers and CRLF line endings', async () => {
		const text = await feedText();
		expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		for (const header of [
			'VERSION:2.0',
			'PRODID:',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
		]) {
			expect(text).toContain(header);
		}
		expect(text.replaceAll('\r\n', '')).not.toContain('\n');
		// Lines are folded at 75 octets.
		for (const line of text.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it('contains only confirmed bookings and blocks, as "Reserved"', async () => {
		const text = await feedText();
		const events = text.split('BEGIN:VEVENT').length - 1;
		expect(events).toBe(2);
		expect(text).toContain(`UID:booking-${confirmed.publicId}@irishette`);
		expect(text).toContain(`UID:block-${block.id}@irishette`);
		expect(text).not.toContain('imported@airbnb.test');
		expect(text.match(/^SUMMARY:.*$/gm)).toEqual([
			'SUMMARY:Reserved',
			'SUMMARY:Reserved',
		]);
	});

	it('has no personal data, notes or confirmation ids', async () => {
		const text = await feedText();
		for (const secret of [
			"O'Guest",
			confirmed.guestEmail,
			confirmed.confirmationId,
			'Injected',
			'Owner stay',
			'Private note',
		]) {
			expect(text).not.toContain(secret);
		}
	});

	it('uses date-only DTEND: check-out for bookings, end + 1 for blocks', async () => {
		const text = await feedText();
		const compact = (d: string) => d.replaceAll('-', '');
		expect(text).toContain(
			`DTSTART;VALUE=DATE:${compact(confirmed.checkInDate)}`,
		);
		expect(text).toContain(
			`DTEND;VALUE=DATE:${compact(confirmed.checkOutDate)}`,
		);
		const blockEnd = new Date(`${block.endDate}T00:00:00Z`);
		blockEnd.setUTCDate(blockEnd.getUTCDate() + 1);
		expect(text).toContain(
			`DTEND;VALUE=DATE:${compact(blockEnd.toISOString().slice(0, 10))}`,
		);
	});
});

describe('export URL management (admin)', () => {
	it('getExportUrl returns the working URL; regenerating revokes the old one', async () => {
		const admin = caller('admin');
		const { url } = await admin.ical.getExportUrl({ roomId: TEXAS.id });
		const path = new URL(url).pathname;
		expect((await get(`http://localhost${path}`)).status).toBe(200);

		const { url: next } = await admin.ical.regenerateExportToken({
			roomId: TEXAS.id,
		});
		expect(next).not.toBe(url);
		expect((await get(`http://localhost${path}`)).status).toBe(404);
		expect(
			(await get(`http://localhost${new URL(next).pathname}`)).status,
		).toBe(200);
	});
});

describe('import feeds (admin)', () => {
	it('creates, lists, updates and deletes feeds; duplicates are CONFLICT', async () => {
		const admin = caller('admin');
		const url = 'https://www.airbnb.com/calendar/ical/123.ics?s=secret';
		const { id } = await admin.ical.createFeed({
			roomId: TEXAS.id,
			source: 'airbnb',
			label: 'Main listing',
			url,
			isActive: true,
		});
		const duplicate = await trpcError(
			admin.ical.createFeed({
				roomId: TEXAS.id,
				source: 'airbnb',
				url,
				isActive: true,
			}),
		);
		expect(duplicate.code).toBe('CONFLICT');

		const feeds = await admin.ical.listFeeds({ roomId: TEXAS.id });
		expect(feeds).toContainEqual(
			expect.objectContaining({
				id,
				url,
				label: 'Main listing',
				isActive: true,
			}),
		);

		await admin.ical.updateFeed({ id, isActive: false });
		expect(
			(await admin.ical.listFeeds({ roomId: TEXAS.id })).find(
				(f) => f.id === id,
			)?.isActive,
		).toBe(false);

		await admin.ical.deleteFeed({ id });
		expect(
			(await admin.ical.listFeeds({ roomId: TEXAS.id })).some(
				(f) => f.id === id,
			),
		).toBe(false);
	});

	it('rejects non-http feed URLs', async () => {
		const error = await trpcError(
			caller('admin').ical.createFeed({
				roomId: TEXAS.id,
				source: 'other',
				url: 'javascript:alert(1)',
				isActive: true,
			}),
		);
		expect(error.code).toBe('BAD_REQUEST');
	});
});
