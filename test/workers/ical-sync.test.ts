import {
	createExecutionContext,
	createScheduledController,
	waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { externalEvents, icalFeeds } from '@/db/schema-export';

import worker from './entry';
import {
	caller,
	db,
	inboxItemsOfKind,
	insertBooking,
	insertFeed,
} from './helpers';
import { calendarResponse, mockFeed, mockEmail, vcalendar } from './mocks';
import { ADMIN } from './seed';

// Import sync, driven through the real cron handler (*/30). Feeds are
// deactivated after each test so later runs only fetch the current test's feed.

const SYNC_CRON = '*/30 * * * *';

async function runSync() {
	const ctx = createExecutionContext();
	await worker.scheduled(
		createScheduledController({ cron: SYNC_CRON }),
		env,
		ctx,
	);
	await waitOnExecutionContext(ctx);
}

async function eventsFor(feedId: string) {
	const rows = await db()
		.select()
		.from(externalEvents)
		.where(eq(externalEvents.feedId, feedId));
	return rows
		.map((r) => ({
			uid: r.uid,
			start: r.startDate,
			end: r.endDate,
			kind: r.kind,
		}))
		.sort((a, b) => a.uid.localeCompare(b.uid));
}

async function feedRow(id: string) {
	const [row] = await db().select().from(icalFeeds).where(eq(icalFeeds.id, id));
	return row;
}

const event = (
	uid: string,
	start: string,
	end: string,
	extra: string[] = [],
) => [
	`UID:${uid}`,
	`DTSTART;VALUE=DATE:${start.replaceAll('-', '')}`,
	`DTEND;VALUE=DATE:${end.replaceAll('-', '')}`,
	'SUMMARY:Reserved',
	...extra,
];

afterEach(async () => {
	await db().update(icalFeeds).set({ isActive: false });
});

/** Serves `bodies` in order, one per sync run (the last one repeats). */
function serveSequence(url: string, bodies: Array<() => Response>) {
	let i = 0;
	return mockFeed(url, () => bodies[Math.min(i++, bodies.length - 1)]());
}

describe('applying a feed', () => {
	it(
		'imports events with exclusive end dates',
		{
			timeout: 10_000,
		},
		async () => {
			const feed = await insertFeed();
			serveSequence(feed.url, [
				() =>
					calendarResponse(
						vcalendar([
							event('a@airbnb.test', '2039-06-10', '2039-06-12'),
							event('b@airbnb.test', '2039-06-20', '2039-06-25'),
						]),
					),
			]);
			await runSync();
			expect(await eventsFor(feed.id)).toEqual([
				{
					uid: 'a@airbnb.test',
					start: '2039-06-10',
					end: '2039-06-12',
					kind: 'reserved',
				},
				{
					uid: 'b@airbnb.test',
					start: '2039-06-20',
					end: '2039-06-25',
					kind: 'reserved',
				},
			]);
			const after = await feedRow(feed.id);
			expect(after.lastError).toBeNull();
			expect(after.lastSuccessAt).toBeInstanceOf(Date);
		},
	);

	it(
		'deletes removed events and updates changed dates',
		{
			timeout: 10_000,
		},
		async () => {
			const feed = await insertFeed();
			serveSequence(feed.url, [
				() =>
					calendarResponse(
						vcalendar([
							event('a@airbnb.test', '2039-07-10', '2039-07-12'),
							event('b@airbnb.test', '2039-07-20', '2039-07-25'),
							event('c@airbnb.test', '2039-07-26', '2039-07-27'),
						]),
					),
				() =>
					calendarResponse(
						vcalendar([
							event('a@airbnb.test', '2039-07-11', '2039-07-13'),
							event('c@airbnb.test', '2039-07-26', '2039-07-27'),
						]),
					),
			]);
			await runSync();
			await runSync();
			expect(await eventsFor(feed.id)).toEqual([
				{
					uid: 'a@airbnb.test',
					start: '2039-07-11',
					end: '2039-07-13',
					kind: 'reserved',
				},
				{
					uid: 'c@airbnb.test',
					start: '2039-07-26',
					end: '2039-07-27',
					kind: 'reserved',
				},
			]);
		},
	);

	it('handles a duplicate UID in the feed', { timeout: 20_000 }, async () => {
		const feed = await insertFeed();
		serveSequence(feed.url, [
			() =>
				calendarResponse(
					vcalendar([
						event('dup@airbnb.test', '2039-08-10', '2039-08-12'),
						event('dup@airbnb.test', '2039-08-10', '2039-08-12'),
					]),
				),
		]);
		await runSync();
		expect(await eventsFor(feed.id)).toHaveLength(1);
	});

	it(
		'writes sync logs, newest first in getSyncLogs',
		{
			timeout: 10_000,
		},
		async () => {
			const feed = await insertFeed();
			serveSequence(feed.url, [
				() =>
					calendarResponse(
						vcalendar([event('a@x', '2039-09-01', '2039-09-02')]),
					),
			]);
			await runSync();
			await runSync();
			const { logs } = await caller('admin').ical.getSyncLogs({
				roomId: feed.roomId,
				limit: 100,
			});
			const times = logs.map((l) => l.createdAt.getTime());
			expect(times).toEqual([...times].sort((a, b) => b - a));
			expect(logs[0].status).toBe('success');
		},
	);
});

describe('feed validation (protect stored data)', () => {
	async function feedWithEvents(uids: string[]) {
		const feed = await insertFeed();
		const first = vcalendar(
			uids.map((uid, i) =>
				event(
					uid,
					`2040-01-${String(10 + i * 2).padStart(2, '0')}`,
					`2040-01-${String(11 + i * 2).padStart(2, '0')}`,
				),
			),
		);
		return { feed, first };
	}

	it(
		'a 500 leaves stored events unchanged and records the error',
		{
			timeout: 10_000,
		},
		async () => {
			const { feed, first } = await feedWithEvents(['a@x', 'b@x']);
			serveSequence(feed.url, [
				() => calendarResponse(first),
				() => new HttpResponse('boom', { status: 500 }),
			]);
			const sent = mockEmail();
			await runSync();
			await runSync();
			expect(await eventsFor(feed.id)).toHaveLength(2);
			expect((await feedRow(feed.id)).lastError).toBe('HTTP 500');
			// One alert when a healthy feed starts failing; none on repeats.
			await runSync();
			expect(sent.filter((e) => e.to.includes(ADMIN.email))).toHaveLength(1);
			// ...mirrored by one inbox item for the feed (per day).
			const items = (await inboxItemsOfKind('ical_sync_failed')).filter((i) =>
				i.dedupeKey?.startsWith(`ical_sync_failed:${feed.id}:`),
			);
			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({ source: 'system', status: 'new' });
			expect(items[0].details).toMatchObject({ problem: 'HTTP 500' });
		},
	);

	it(
		'an empty calendar leaves stored events unchanged, records the error and alerts the admin',
		{
			timeout: 10_000,
		},
		async () => {
			const { feed, first } = await feedWithEvents(['a@x', 'b@x']);
			serveSequence(feed.url, [
				() => calendarResponse(first),
				() => calendarResponse(vcalendar([])),
			]);
			const sent = mockEmail();
			await runSync();
			await runSync();
			expect(await eventsFor(feed.id)).toHaveLength(2);
			expect((await feedRow(feed.id)).lastError).toBeTruthy();
			expect(sent.some((e) => e.to.includes(ADMIN.email))).toBe(true);
		},
	);

	it(
		'an HTML page leaves stored events unchanged',
		{
			timeout: 10_000,
		},
		async () => {
			const { feed, first } = await feedWithEvents(['a@x', 'b@x']);
			serveSequence(feed.url, [
				() => calendarResponse(first),
				() => HttpResponse.html('<html><body>Sign in</body></html>'),
			]);
			mockEmail();
			await runSync();
			await runSync();
			expect(await eventsFor(feed.id)).toHaveLength(2);
			expect((await feedRow(feed.id)).lastError).toBeTruthy();
		},
	);

	it(
		'a sudden drop of more than half is not applied',
		{
			timeout: 10_000,
		},
		async () => {
			const { feed, first } = await feedWithEvents([
				'a@x',
				'b@x',
				'c@x',
				'd@x',
			]);
			serveSequence(feed.url, [
				() => calendarResponse(first),
				() =>
					calendarResponse(
						vcalendar([event('a@x', '2040-01-10', '2040-01-11')]),
					),
			]);
			mockEmail();
			await runSync();
			await runSync();
			expect(await eventsFor(feed.id)).toHaveLength(4);
		},
	);

	it(
		'uses conditional GET (ETag / 304)',
		{
			timeout: 10_000,
		},
		async () => {
			const feed = await insertFeed();
			const body = vcalendar([event('a@x', '2040-02-10', '2040-02-12')]);
			const requests = mockFeed(feed.url, (request) =>
				request.headers.get('if-none-match') === '"v1"'
					? new HttpResponse(null, { status: 304 })
					: calendarResponse(body, { ETag: '"v1"' }),
			);
			await runSync();
			const firstSuccess = (await feedRow(feed.id)).lastSuccessAt;
			await new Promise((r) => setTimeout(r, 1100));
			await runSync();
			expect(requests[1].headers.get('if-none-match')).toBe('"v1"');
			expect(await eventsFor(feed.id)).toHaveLength(1);
			const after = await feedRow(feed.id);
			expect(after.lastError).toBeNull();
			expect(after.lastSuccessAt?.getTime()).toBeGreaterThan(
				firstSuccess?.getTime() ?? 0,
			);
		},
	);
});

describe('conflicts', () => {
	it(
		'an imported event over a confirmed booking emails the admin',
		{
			timeout: 10_000,
		},
		async () => {
			const booking = await insertBooking({
				checkInDate: '2040-03-10',
				checkOutDate: '2040-03-12',
			});
			const feed = await insertFeed();
			serveSequence(feed.url, [
				() =>
					calendarResponse(
						vcalendar([event('c@x', '2040-03-11', '2040-03-13')]),
					),
			]);
			const sent = mockEmail();
			await runSync();
			expect(sent.some((e) => e.to.includes(ADMIN.email))).toBe(true);
			const items = (await inboxItemsOfKind('ical_conflict')).filter((i) =>
				i.dedupeKey?.startsWith(`ical_conflict:${feed.id}:`),
			);
			expect(items).toHaveLength(1);
			expect(items[0].bookingId).toBe(booking.id);
			expect(items[0].details).toMatchObject({
				conflicts: [
					expect.objectContaining({
						confirmationId: booking.confirmationId,
						eventStart: '2040-03-11',
					}),
				],
			});
		},
	);
});

describe('parsing (RFC 5545)', () => {
	async function importOne(props: string[][]) {
		const feed = await insertFeed();
		const body = vcalendar(props);
		serveSequence(feed.url, [() => calendarResponse(body)]);
		await runSync();
		return eventsFor(feed.id);
	}

	it('reads VALUE=DATE events', { timeout: 20_000 }, async () => {
		expect(await importOne([event('d@x', '2041-01-10', '2041-01-12')])).toEqual(
			[
				{
					uid: 'd@x',
					start: '2041-01-10',
					end: '2041-01-12',
					kind: 'reserved',
				},
			],
		);
	});

	it('skips events without a UID', { timeout: 20_000 }, async () => {
		expect(
			await importOne([
				[
					'DTSTART;VALUE=DATE:20410201',
					'DTEND;VALUE=DATE:20410203',
					'SUMMARY:x',
				],
			]),
		).toEqual([]);
	});

	it('unfolds folded lines', { timeout: 20_000 }, async () => {
		const rows = await importOne([
			[
				'UID:folded-1234567890',
				' abcdef@airbnb.test',
				'DTSTART;VALUE=DATE:20410301',
				'DTEND;VALUE=DATE:20410303',
			],
		]);
		expect(rows.map((r) => r.uid)).toEqual([
			'folded-1234567890abcdef@airbnb.test',
		]);
	});

	it(
		'converts UTC times to the property date (America/Chicago)',
		{
			timeout: 10_000,
		},
		async () => {
			// 03:00Z on Apr 11 is 22:00 on Apr 10 in Chicago.
			const rows = await importOne([
				['UID:utc@x', 'DTSTART:20410411T030000Z', 'DTEND:20410413T030000Z'],
			]);
			expect(rows).toEqual([
				{
					uid: 'utc@x',
					start: '2041-04-10',
					end: '2041-04-12',
					kind: 'reserved',
				},
			]);
		},
	);

	it('reads TZID local times', { timeout: 20_000 }, async () => {
		const rows = await importOne([
			[
				'UID:tzid@x',
				'DTSTART;TZID=America/Chicago:20410510T150000',
				'DTEND;TZID=America/Chicago:20410512T110000',
			],
		]);
		expect(rows).toEqual([
			{
				uid: 'tzid@x',
				start: '2041-05-10',
				end: '2041-05-12',
				kind: 'reserved',
			},
		]);
	});

	it(
		'supports DURATION instead of DTEND',
		{
			timeout: 10_000,
		},
		async () => {
			const rows = await importOne([
				['UID:dur@x', 'DTSTART;VALUE=DATE:20410610', 'DURATION:P3D'],
			]);
			expect(rows).toEqual([
				{
					uid: 'dur@x',
					start: '2041-06-10',
					end: '2041-06-13',
					kind: 'reserved',
				},
			]);
		},
	);

	it(
		'treats a missing DTEND on a date as one day',
		{
			timeout: 10_000,
		},
		async () => {
			const rows = await importOne([
				['UID:one@x', 'DTSTART;VALUE=DATE:20410710'],
			]);
			expect(rows).toEqual([
				{
					uid: 'one@x',
					start: '2041-07-10',
					end: '2041-07-11',
					kind: 'reserved',
				},
			]);
		},
	);

	it('skips STATUS:CANCELLED', { timeout: 20_000 }, async () => {
		expect(
			await importOne([
				event('cx@x', '2041-08-10', '2041-08-12', ['STATUS:CANCELLED']),
			]),
		).toEqual([]);
	});

	it('skips our own exported events', { timeout: 20_000 }, async () => {
		expect(
			await importOne([
				event('booking-abc0000000000000@irishette', '2041-09-10', '2041-09-12'),
			]),
		).toEqual([]);
	});

	it(
		'keeps host blocks as unavailable',
		{
			timeout: 10_000,
		},
		async () => {
			const rows = await importOne([
				[
					'UID:blocked@airbnb.test',
					'DTSTART;VALUE=DATE:20411010',
					'DTEND;VALUE=DATE:20411012',
					'SUMMARY:Airbnb (Not available)',
				],
			]);
			expect(rows).toEqual([
				{
					uid: 'blocked@airbnb.test',
					start: '2041-10-10',
					end: '2041-10-12',
					kind: 'unavailable',
				},
			]);
		},
	);
});
