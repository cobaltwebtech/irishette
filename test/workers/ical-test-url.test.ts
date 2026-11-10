import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';

import { MAX_FEED_BYTES } from '@/lib/ical/ical-fetch';

import { caller, trpcError } from './helpers';
import { calendarResponse, mockFeed, vcalendar } from './mocks';
import { TEXAS } from './seed';

// ical.testUrl fetches an admin-supplied URL: https only, no IP literals or
// localhost (also after redirects), with a timeout and a size cap.

const admin = () => caller('admin');

const FEED = vcalendar([
	[
		'UID:a@test',
		'DTSTART;VALUE=DATE:20400101',
		'DTEND;VALUE=DATE:20400102',
		'SUMMARY:Reserved',
	],
]);

describe('feed URL validation', () => {
	it.each([
		'http://feeds.example.test/cal.ics',
		'https://127.0.0.1/cal.ics',
		'https://[::1]/cal.ics',
		'https://localhost/cal.ics',
		'https://api.localhost/cal.ics',
		'https://user:pass@feeds.example.test/cal.ics',
	])('rejects %s', async (url) => {
		const tested = await trpcError(admin().ical.testUrl({ url }));
		expect(tested.code).toBe('BAD_REQUEST');
		const created = await trpcError(
			admin().ical.createFeed({
				roomId: TEXAS.id,
				source: 'other',
				url,
				isActive: true,
			}),
		);
		expect(created.code).toBe('BAD_REQUEST');
	});
});

describe('ical.testUrl', () => {
	it('reports a valid feed', async () => {
		const url = 'https://feeds.example.test/ok.ics';
		mockFeed(url, () => calendarResponse(FEED));
		await expect(admin().ical.testUrl({ url })).resolves.toMatchObject({
			success: true,
			eventCount: 1,
		});
	});

	it('follows a redirect to a safe host', async () => {
		const url = 'https://feeds.example.test/moved.ics';
		const target = 'https://cdn.example.test/cal.ics';
		mockFeed(
			url,
			() =>
				new HttpResponse(null, { status: 302, headers: { Location: target } }),
		);
		mockFeed(target, () => calendarResponse(FEED));
		await expect(admin().ical.testUrl({ url })).resolves.toMatchObject({
			success: true,
		});
	});

	it('refuses a redirect to an IP address', async () => {
		const url = 'https://feeds.example.test/sneaky.ics';
		mockFeed(
			url,
			() =>
				new HttpResponse(null, {
					status: 302,
					headers: { Location: 'https://10.0.0.1/cal.ics' },
				}),
		);
		await expect(admin().ical.testUrl({ url })).resolves.toEqual({
			success: false,
			error: 'Feed URLs must be public https URLs',
		});
	});

	it('refuses a feed over the size cap', async () => {
		const url = 'https://feeds.example.test/huge.ics';
		mockFeed(url, () => calendarResponse('X'.repeat(MAX_FEED_BYTES + 1)));
		await expect(admin().ical.testUrl({ url })).resolves.toEqual({
			success: false,
			error: 'The feed is too large',
		});
	});
});
