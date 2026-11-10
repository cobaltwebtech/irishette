import {
	createExecutionContext,
	createScheduledController,
	waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings, icalFeeds, icalSyncLog } from '@/db/schema-export';
import * as scheduledTasks from '@/lib/server/scheduled-tasks';

import configSource from '../../cloudflare.config.ts?raw';
import worker from './entry';
import { db, insertBooking, insertFeed } from './helpers';
import {
	calendarResponse,
	mockFeed,
	mockResend,
	mockStripeCheckout,
	vcalendar,
} from './mocks';
import { ROSE } from './seed';

async function runCron(cron: string) {
	const ctx = createExecutionContext();
	await worker.scheduled(createScheduledController({ cron }), env, ctx);
	await waitOnExecutionContext(ctx);
}

async function exists(id: string) {
	const rows = await db()
		.select({ id: bookings.id })
		.from(bookings)
		.where(eq(bookings.id, id));
	return rows.length === 1;
}

const configCrons = [...configSource.matchAll(/schedule:\s*'([^']+)'/g)].map(
	(m) => m[1],
);

describe('cron map', () => {
	it('cloudflare.config.ts declares the three crons', () => {
		expect(configCrons.sort()).toEqual(
			['*/30 * * * *', '15 9 * * *', '5 8 * * *'].sort(),
		);
	});

	it('CRON_SCHEDULES matches the triggers in cloudflare.config.ts', () => {
		const map = (scheduledTasks as Record<string, unknown>).CRON_SCHEDULES as
			| Record<string, unknown>
			| undefined;
		expect(Object.keys(map ?? {}).sort()).toEqual([...configCrons].sort());
	});
});

describe('expired pending bookings cleanup (5 8 * * *)', () => {
	it('deletes expired holds and keeps live ones and confirmed bookings', async () => {
		const expired = await insertBooking({
			checkInDate: '2042-01-10',
			checkOutDate: '2042-01-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60_000),
		});
		const live = await insertBooking({
			checkInDate: '2042-02-10',
			checkOutDate: '2042-02-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() + 20 * 60_000),
		});
		const confirmed = await insertBooking({
			checkInDate: '2042-03-10',
			checkOutDate: '2042-03-12',
		});
		await runCron('5 8 * * *');
		expect(await exists(expired.id)).toBe(false);
		expect(await exists(live.id)).toBe(true);
		expect(await exists(confirmed.id)).toBe(true);
	});

	it('confirms an expired hold whose Checkout Session was paid', async () => {
		const checkout = mockStripeCheckout();
		mockResend();
		const paid = await insertBooking({
			checkInDate: '2042-04-10',
			checkOutDate: '2042-04-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60_000),
			stripeSessionId: 'cs_test_paid_late',
		});
		checkout.add({
			id: 'cs_test_paid_late',
			amount_total: Math.round(paid.totalAmount * 100),
			client_reference_id: paid.id,
			metadata: { bookingId: paid.id },
		});
		checkout.complete('cs_test_paid_late');
		await runCron('5 8 * * *');
		expect(await exists(paid.id)).toBe(true);
		const [row] = await db()
			.select({ status: bookings.status })
			.from(bookings)
			.where(eq(bookings.id, paid.id));
		expect(row.status).toBe('confirmed');
	});

	it("expires an expired hold's open session before deleting it", async () => {
		const checkout = mockStripeCheckout();
		const open = await insertBooking({
			checkInDate: '2042-05-10',
			checkOutDate: '2042-05-12',
			status: 'pending',
			paymentStatus: 'pending',
			expiresAt: new Date(Date.now() - 60_000),
			stripeSessionId: 'cs_test_open_late',
		});
		checkout.add({ id: 'cs_test_open_late' });
		await runCron('5 8 * * *');
		expect(checkout.expired).toContain('cs_test_open_late');
		expect(await exists(open.id)).toBe(false);
	});

	it('keeps an expired hold whose delayed payment is processing', async () => {
		const processing = await insertBooking({
			checkInDate: '2042-06-10',
			checkOutDate: '2042-06-12',
			status: 'pending',
			paymentStatus: 'processing',
			expiresAt: new Date(Date.now() - 60_000),
		});
		await runCron('5 8 * * *');
		expect(await exists(processing.id)).toBe(true);
	});
});

describe('iCal sync log cleanup (15 9 * * *)', () => {
	it('deletes logs older than 30 days', async () => {
		const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
		await db()
			.insert(icalSyncLog)
			.values([
				{
					roomId: ROSE.id,
					platform: 'airbnb',
					status: 'success',
					createdAt: old,
				},
				{
					roomId: ROSE.id,
					platform: 'airbnb',
					status: 'success',
					createdAt: new Date(),
				},
			]);
		await runCron('15 9 * * *');
		const logs = await db().select().from(icalSyncLog);
		expect(logs.every((l) => l.createdAt.getTime() > old.getTime())).toBe(true);
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});
});

describe('unknown cron', () => {
	it('does nothing (no feed fetches)', async () => {
		const feed = await insertFeed();
		const requests = mockFeed(feed.url, () => calendarResponse(vcalendar([])));
		await runCron('0 0 1 1 *');
		expect(requests).toHaveLength(0);
		await db().update(icalFeeds).set({ isActive: false });
	});
});
