import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { adminInboxItems } from '@/db/schema-export';
import type { InboxKind } from '@/lib/inbox/inbox';
import { createInboxItem, type NewInboxItem } from '@/lib/inbox/inbox-service';

import { caller, db, insertBooking, trpcError } from './helpers';
import { GUEST } from './seed';

// The admin notification inbox: createInboxItem (dedupe, resurfacing,
// linking) and the inbox.* procedures (keyset pagination, filters, status,
// delete, per-booking / per-guest lists). Access control is swept in
// trpc-authz.test.ts.

const admin = () => caller('admin');

function syncFailed(
	overrides: Partial<NewInboxItem<'ical_sync_failed'>> = {},
): NewInboxItem<'ical_sync_failed'> {
	return {
		kind: 'ical_sync_failed',
		title: 'Calendar sync problem',
		summary: 'HTTP 500',
		details: {
			roomName: 'Rose Room',
			roomPublicId: 'seedroomrose0001',
			feedSource: 'airbnb',
			feedLabel: null,
			problem: 'HTTP 500',
		},
		...overrides,
	};
}

async function rowByPublicId(publicId: string) {
	const [row] = await db()
		.select()
		.from(adminInboxItems)
		.where(eq(adminInboxItems.publicId, publicId));
	return row;
}

/** Creates `n` items, each surfaced one minute after the previous. */
async function createSeries(
	n: number,
	{ kind = 'ical_sync_failed' as InboxKind, title = 'Item' } = {},
) {
	const start = Date.UTC(2030, 0, 1);
	const ids: string[] = [];
	for (let i = 0; i < n; i++) {
		const item =
			kind === 'refund_failed'
				? ({
						kind: 'refund_failed',
						title: `${title} ${i}`,
						summary: 'Refund failed',
						details: {
							refundId: `re_${i}`,
							amount: 10,
							currency: 'usd',
							paymentIntentId: null,
							confirmationId: null,
							failureReason: null,
							livemode: false,
						},
					} satisfies NewInboxItem<'refund_failed'>)
				: syncFailed({ title: `${title} ${i}` });
		ids.push(
			(await createInboxItem({ db: db() }, item, {
				now: new Date(start + i * 60_000),
			})) as string,
		);
	}
	// Newest first, like the list.
	return ids.reverse();
}

beforeEach(async () => {
	await db().delete(adminInboxItems);
});

describe('createInboxItem', () => {
	it('inserts a new item and returns its publicId', async () => {
		const publicId = await createInboxItem({ db: db() }, syncFailed());
		expect(publicId).toMatch(/^[0-9a-z]{16}$/);
		const row = await rowByPublicId(publicId as string);
		expect(row).toMatchObject({
			source: 'system',
			kind: 'ical_sync_failed',
			status: 'new',
			occurrences: 1,
			dedupeKey: null,
		});
		expect(row.details).toMatchObject({ problem: 'HTTP 500' });
	});

	it('the same dedupe key updates the item and resurfaces it', async () => {
		const t0 = new Date('2030-02-01T00:00:00Z');
		const t1 = new Date('2030-02-01T01:00:00Z');
		const first = await createInboxItem(
			{ db: db() },
			syncFailed({ dedupeKey: 'test:resurface' }),
			{ now: t0 },
		);
		await admin().inbox.adminSetStatus({
			publicIds: [first as string],
			status: 'archived',
		});
		const second = await createInboxItem(
			{ db: db() },
			syncFailed({
				dedupeKey: 'test:resurface',
				summary: 'HTTP 503',
				details: { ...syncFailed().details, problem: 'HTTP 503' },
			}),
			{ now: t1 },
		);
		expect(second).toBe(first);
		const row = await rowByPublicId(first as string);
		expect(row).toMatchObject({
			status: 'new',
			summary: 'HTTP 503',
			occurrences: 2,
			readAt: null,
			archivedAt: null,
			surfacedAt: t1,
			createdAt: t0,
		});
		expect(row.details).toMatchObject({ problem: 'HTTP 503' });
		const all = await db().select().from(adminInboxItems);
		expect(all).toHaveLength(1);
	});

	it('resurfaceAfterSeconds keeps a recent item as it is', async () => {
		const t0 = new Date('2030-03-01T00:00:00Z');
		const options = { resurfaceAfterSeconds: 24 * 60 * 60 };
		const publicId = (await createInboxItem(
			{ db: db() },
			syncFailed({ dedupeKey: 'test:quiet' }),
			{ ...options, now: t0 },
		)) as string;
		await admin().inbox.adminSetStatus({
			publicIds: [publicId],
			status: 'read',
		});

		// 30 minutes later: counted, not resurfaced.
		await createInboxItem(
			{ db: db() },
			syncFailed({ dedupeKey: 'test:quiet' }),
			{ ...options, now: new Date(t0.getTime() + 30 * 60_000) },
		);
		let row = await rowByPublicId(publicId);
		expect(row).toMatchObject({
			status: 'read',
			occurrences: 2,
			surfacedAt: t0,
		});

		// A day later: back to new, at the top.
		const later = new Date(t0.getTime() + 24 * 60 * 60_000);
		await createInboxItem(
			{ db: db() },
			syncFailed({ dedupeKey: 'test:quiet' }),
			{ ...options, now: later },
		);
		row = await rowByPublicId(publicId);
		expect(row).toMatchObject({
			status: 'new',
			occurrences: 3,
			surfacedAt: later,
		});
	});

	it('links a booking and a guest', async () => {
		const booking = await insertBooking();
		const publicId = await createInboxItem(
			{ db: db() },
			syncFailed({ bookingId: booking.id, userId: GUEST.id }),
		);
		const row = await rowByPublicId(publicId as string);
		expect(row.bookingId).toBe(booking.id);
		expect(row.userId).toBe(GUEST.id);
	});

	it('never throws: a failed write returns null', async () => {
		const result = await createInboxItem(
			{ db: db() },
			syncFailed({ bookingId: '019a5f00-0000-7000-8000-0000000fffff' }),
		);
		expect(result).toBeNull();
	});
});

describe('inbox.adminList (keyset pagination)', () => {
	it('pages newest first and back again with stable cursors', async () => {
		const ids = await createSeries(5);
		const page1 = await admin().inbox.adminList({ pageSize: 2 });
		expect(page1.items.map((i) => i.publicId)).toEqual(ids.slice(0, 2));
		expect(page1.prevCursor).toBeNull();
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await admin().inbox.adminList({
			pageSize: 2,
			cursor: page1.nextCursor as string,
		});
		expect(page2.items.map((i) => i.publicId)).toEqual(ids.slice(2, 4));

		// A new item arriving meanwhile does not shift the next page.
		await createInboxItem({ db: db() }, syncFailed({ title: 'Newest' }), {
			now: new Date(Date.UTC(2031, 0, 1)),
		});
		const page3 = await admin().inbox.adminList({
			pageSize: 2,
			cursor: page2.nextCursor as string,
		});
		expect(page3.items.map((i) => i.publicId)).toEqual(ids.slice(4));
		expect(page3.nextCursor).toBeNull();

		const back = await admin().inbox.adminList({
			pageSize: 2,
			cursor: page3.prevCursor as string,
			direction: 'prev',
		});
		expect(back.items.map((i) => i.publicId)).toEqual(ids.slice(2, 4));
		expect(back.nextCursor).toBe(page2.nextCursor);
		expect(back.prevCursor).not.toBeNull();
	});

	it('filters by view, source, kind and search', async () => {
		const system = await createSeries(2, { title: 'Sync' });
		const stripe = await createSeries(1, {
			kind: 'refund_failed',
			title: '100% refund_x',
		});
		await admin().inbox.adminSetStatus({
			publicIds: [system[0]],
			status: 'archived',
		});

		const inbox = await admin().inbox.adminList({});
		expect(inbox.items.map((i) => i.publicId).sort()).toEqual(
			[system[1], stripe[0]].sort(),
		);
		const archived = await admin().inbox.adminList({ view: 'archived' });
		expect(archived.items.map((i) => i.publicId)).toEqual([system[0]]);
		const bySource = await admin().inbox.adminList({ source: 'stripe' });
		expect(bySource.items.map((i) => i.publicId)).toEqual(stripe);
		expect(bySource.items[0].source).toBe('stripe');
		const byKind = await admin().inbox.adminList({ kind: 'ical_sync_failed' });
		expect(byKind.items.map((i) => i.publicId)).toEqual([system[1]]);

		// % and _ are literal characters in the search.
		const literal = await admin().inbox.adminList({ search: '100% refund_' });
		expect(literal.items.map((i) => i.publicId)).toEqual(stripe);
		const none = await admin().inbox.adminList({ search: '%' });
		expect(none.items.map((i) => i.publicId)).toEqual(stripe);

		expect(await admin().inbox.adminCount({})).toEqual({ total: 2 });
		expect(await admin().inbox.adminCount({ view: 'archived' })).toEqual({
			total: 1,
		});
	});

	it('joins the booking confirmation id and guest name', async () => {
		const booking = await insertBooking();
		await createInboxItem(
			{ db: db() },
			syncFailed({ bookingId: booking.id, userId: GUEST.id }),
		);
		const { items } = await admin().inbox.adminList({});
		expect(items[0].booking).toEqual({
			publicId: booking.publicId,
			confirmationId: booking.confirmationId,
		});
		expect(items[0].guest).toEqual({
			publicId: GUEST.publicId,
			name: GUEST.name,
		});
		// List rows carry no details JSON and no internal ids.
		expect(items[0]).not.toHaveProperty('details');
		expect(items[0]).not.toHaveProperty('id');
	});
});

describe('inbox status, count, get and delete', () => {
	it('counts unread and changes status in bulk', async () => {
		const ids = await createSeries(3);
		expect(await admin().inbox.adminUnreadCount()).toEqual({ unread: 3 });

		await admin().inbox.adminSetStatus({ publicIds: ids, status: 'read' });
		expect(await admin().inbox.adminUnreadCount()).toEqual({ unread: 0 });
		const read = await rowByPublicId(ids[0]);
		expect(read.readAt).toBeInstanceOf(Date);

		await admin().inbox.adminSetStatus({
			publicIds: [ids[0]],
			status: 'archived',
		});
		expect((await rowByPublicId(ids[0])).archivedAt).toBeInstanceOf(Date);
		await admin().inbox.adminSetStatus({
			publicIds: [ids[0]],
			status: 'unarchived',
		});
		expect(await rowByPublicId(ids[0])).toMatchObject({
			status: 'read',
			archivedAt: null,
		});

		await admin().inbox.adminSetStatus({ publicIds: [ids[1]], status: 'new' });
		expect(await rowByPublicId(ids[1])).toMatchObject({
			status: 'new',
			readAt: null,
		});
		expect(await admin().inbox.adminUnreadCount()).toEqual({ unread: 1 });
	});

	it('gets one item with details and links, NOT_FOUND otherwise', async () => {
		const booking = await insertBooking();
		const publicId = (await createInboxItem(
			{ db: db() },
			syncFailed({ bookingId: booking.id, userId: GUEST.id }),
		)) as string;
		const item = await admin().inbox.adminGet({ publicId });
		expect(item.details).toMatchObject({ problem: 'HTTP 500' });
		expect(item.booking?.confirmationId).toBe(booking.confirmationId);
		expect(item.guest?.email).toBe(GUEST.email);
		expect(item).not.toHaveProperty('id');

		const error = await trpcError(
			admin().inbox.adminGet({ publicId: '0000000000000000' }),
		);
		expect(error.code).toBe('NOT_FOUND');
	});

	it('deletes items in bulk', async () => {
		const ids = await createSeries(3);
		expect(
			await admin().inbox.adminDelete({ publicIds: ids.slice(0, 2) }),
		).toEqual({ deleted: 2 });
		const left = await db().select().from(adminInboxItems);
		expect(left.map((r) => r.publicId)).toEqual([ids[2]]);
	});
});

describe('per-booking and per-guest lists', () => {
	it('lists only the items linked to the booking / guest', async () => {
		const booking = await insertBooking();
		const other = await insertBooking({
			checkInDate: '2030-08-10',
			checkOutDate: '2030-08-12',
		});
		const mine = await createInboxItem(
			{ db: db() },
			syncFailed({ bookingId: booking.id, userId: GUEST.id }),
		);
		await createInboxItem({ db: db() }, syncFailed({ bookingId: other.id }));
		await createInboxItem({ db: db() }, syncFailed());

		const forBooking = await admin().inbox.adminListForBooking({
			bookingPublicId: booking.publicId,
		});
		expect(forBooking.map((i) => i.publicId)).toEqual([mine]);
		const forUser = await admin().inbox.adminListForUser({
			userPublicId: GUEST.publicId,
		});
		expect(forUser.map((i) => i.publicId)).toEqual([mine]);
	});
});
