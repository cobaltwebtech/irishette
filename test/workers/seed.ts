import { env } from 'cloudflare:workers';
import { createDrizzle } from '@/db/drizzle-init';
import { room, user } from '@/db/schema-export';

// Synthetic fixtures for the workers tests (never real data). Fixed ids so
// tests can reference them. Dates used by tests are far in the future so
// "not in the past" checks never depend on the day the suite runs.

export const ROSE = {
	id: '019a5f00-0000-7000-8000-000000000001',
	publicId: 'seedroomrose0001',
	slug: 'rose-room',
	name: 'Rose Room',
	basePrice: 100,
	maxGuests: 2,
	icalExportToken: 'test-rose-export-token-0000000000000000000000',
} as const;

export const TEXAS = {
	id: '019a5f00-0000-7000-8000-000000000002',
	publicId: 'seedroomtexas001',
	slug: 'texas-room',
	name: 'Texas Room',
	basePrice: 120,
	maxGuests: 2,
	icalExportToken: 'test-texas-export-token-000000000000000000000',
} as const;

export const ADMIN = {
	id: '019a5f00-0000-7000-8000-00000000a001',
	publicId: 'seeduseradmin001',
	name: 'Test Admin',
	email: 'admin@example.test',
	role: 'admin',
} as const;

export const GUEST = {
	id: '019a5f00-0000-7000-8000-00000000a002',
	publicId: 'seeduserguest001',
	name: 'Test Guest',
	email: 'guest@example.test',
	role: 'user',
} as const;

export const OTHER_GUEST = {
	id: '019a5f00-0000-7000-8000-00000000a003',
	publicId: 'seeduserother001',
	name: 'Other Guest',
	email: 'other@example.test',
	role: 'user',
} as const;

const SEED_USERS = [ADMIN, GUEST, OTHER_GUEST] as const;

export async function seed() {
	const db = createDrizzle(env.DB);
	const now = new Date();
	await db
		.insert(room)
		.values(
			[ROSE, TEXAS].map((r) => ({
				...r,
				description: `Test fixture: ${r.name}`,
				serviceFeeRate: 0.12,
				stateTaxRate: 0.06,
				cityTaxRate: 0.07,
				status: 'active' as const,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			})),
		)
		.onConflictDoNothing();
	await db
		.insert(user)
		.values(
			SEED_USERS.map((u) => ({
				...u,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			})),
		)
		.onConflictDoNothing();
}
