import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { room } from '@/db/schema-export';

import { caller, db, trpcError } from './helpers';
import { ROSE } from './seed';

// Public room lookups only return active rooms; admin pages use
// rooms.adminList / rooms.adminGet, which return every status.

const HIDDEN = {
	publicId: 'seedroomhidden01',
	slug: 'hidden-room',
	name: 'Hidden Room',
	basePrice: 90,
	status: 'inactive' as const,
	isActive: false,
};

const ARCHIVED = {
	publicId: 'seedroomarchiv01',
	slug: 'archived-room',
	name: 'Archived Room',
	basePrice: 80,
	status: 'archived' as const,
	isActive: false,
};

beforeAll(async () => {
	await db().insert(room).values([HIDDEN, ARCHIVED]);
});

describe('public room lookups', () => {
	it('rooms.list returns active rooms only', async () => {
		const all = await caller(null).rooms.list({ limit: 100 });
		const slugs = all.rooms.map((r) => r.slug);
		expect(slugs).toContain(ROSE.slug);
		expect(slugs).not.toContain(HIDDEN.slug);
		expect(slugs).not.toContain(ARCHIVED.slug);
		expect(all.pagination.total).toBe(all.rooms.length);
	});

	it('rooms.get hides non-active rooms (NOT_FOUND)', async () => {
		for (const input of [
			{ slug: HIDDEN.slug },
			{ publicId: HIDDEN.publicId },
			{ slug: ARCHIVED.slug },
		]) {
			const error = await trpcError(caller(null).rooms.get(input));
			expect(error.code).toBe('NOT_FOUND');
		}
		await expect(
			caller(null).rooms.get({ slug: ROSE.slug }),
		).resolves.toMatchObject({ slug: ROSE.slug });
	});
});

describe('admin room lookups', () => {
	it('rooms.adminList returns every status, filterable', async () => {
		const all = await caller('admin').rooms.adminList({ limit: 100 });
		const slugs = all.rooms.map((r) => r.slug);
		expect(slugs).toEqual(
			expect.arrayContaining([ROSE.slug, HIDDEN.slug, ARCHIVED.slug]),
		);
		const inactive = await caller('admin').rooms.adminList({
			limit: 100,
			status: 'inactive',
		});
		expect(inactive.rooms.map((r) => r.slug)).toEqual([HIDDEN.slug]);
	});

	it('rooms.adminGet opens an inactive room', async () => {
		await expect(
			caller('admin').rooms.adminGet({ publicId: HIDDEN.publicId }),
		).resolves.toMatchObject({ slug: HIDDEN.slug, status: 'inactive' });
	});

	it('normal users cannot call them', async () => {
		const error = await trpcError(
			caller('user').rooms.adminList({ limit: 10 }),
		);
		expect(error.code).toBe('FORBIDDEN');
	});
});
