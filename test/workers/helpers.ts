import { TRPCError } from '@trpc/server';
import {
	createExecutionContext,
	waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect } from 'vite-plus/test';

import { createDrizzle } from '@/db/drizzle-init';
import {
	bookings,
	externalEvents,
	icalFeeds,
	roomBlockedPeriods,
	roomPricingRules,
} from '@/db/schema-export';
import {
	type AuthSession,
	createInnerTRPCContext,
} from '@/integrations/trpc/inner-context';
import { trpcRouter } from '@/integrations/trpc/router';
import { newId, newPublicId } from '@/lib/ids';

import worker from './entry';
import { ADMIN, GUEST, OTHER_GUEST, ROSE } from './seed';

export const db = () => createDrizzle(env.DB);

type SeedUser = typeof ADMIN | typeof GUEST | typeof OTHER_GUEST;

/** A minimal Better Auth session for a seeded user. */
function fakeSession(u: SeedUser): NonNullable<AuthSession> {
	const now = new Date();
	return {
		session: {
			id: newId(),
			token: `test-token-${u.id}`,
			userId: u.id,
			expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
			createdAt: now,
			updatedAt: now,
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: u.id,
			publicId: u.publicId,
			name: u.name,
			email: u.email,
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now,
			role: u.role,
			banned: false,
			banReason: null,
			banExpires: null,
			phoneNumber: null,
			phoneNumberVerified: false,
		},
	} as unknown as NonNullable<AuthSession>;
}

/**
 * A tRPC caller as an anonymous visitor (`null`), a normal user ('user', the
 * seeded GUEST), another normal user ('other') or an admin ('admin').
 * Users are seeded in seed.ts, so ids match real rows.
 */
/** Background work (emails, alerts) started by procedures under test. */
const pending: Promise<unknown>[] = [];

/** Waits for all background work started so far (like waitUntil). */
export async function settle() {
	while (pending.length > 0) {
		await Promise.allSettled(pending.splice(0));
	}
}

export function makeCtx(role: 'admin' | 'user' | 'other' | null) {
	const u =
		role === 'admin'
			? ADMIN
			: role === 'user'
				? GUEST
				: role === 'other'
					? OTHER_GUEST
					: null;
	return createInnerTRPCContext({
		session: u ? fakeSession(u) : null,
		waitUntil: (p) => {
			pending.push(p);
		},
	});
}

/**
 * Calls the test Worker's fetch handler and waits for its background work
 * (ctx.waitUntil), like a finished request in production.
 */
export async function fetchWorker(request: Request) {
	const ctx = createExecutionContext();
	const response = await worker.fetch(
		request as Request<unknown, IncomingRequestCfProperties>,
		env,
		ctx,
	);
	await waitOnExecutionContext(ctx);
	return response;
}

export function caller(role: 'admin' | 'user' | 'other' | null) {
	return trpcRouter.createCaller(makeCtx(role));
}

/** Awaits a rejected tRPC call and returns the TRPCError for assertions. */
export async function trpcError(promise: Promise<unknown>): Promise<TRPCError> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(TRPCError);
		return error as TRPCError;
	}
	throw new Error('Expected the call to fail, but it succeeded');
}

/** Reads a structured field (conflict/conflicts) from a TRPCError cause. */
export function causeField(error: TRPCError, key: string): unknown {
	const cause = error.cause as Record<string, unknown> | undefined;
	return cause?.[key];
}

// --- Direct inserts for arranging state ---------------------------------

type BookingOverrides = Partial<typeof bookings.$inferInsert>;

export async function insertBooking(overrides: BookingOverrides = {}) {
	const row = {
		id: newId(),
		publicId: newPublicId(),
		confirmationId: newPublicId().slice(0, 6).toUpperCase(),
		userId: GUEST.id,
		roomId: ROSE.id,
		checkInDate: '2030-06-10',
		checkOutDate: '2030-06-12',
		numberOfNights: 2,
		numberOfGuests: 1,
		baseAmount: 200,
		taxAmount: 26,
		feesAmount: 24,
		totalAmount: 250,
		status: 'confirmed',
		paymentStatus: 'paid',
		guestName: 'Fixture Guest',
		guestEmail: GUEST.email,
		guestPhone: '5555550100',
		...overrides,
	} satisfies typeof bookings.$inferInsert;
	await db().insert(bookings).values(row);
	return row;
}

export async function insertFeed(
	overrides: Partial<typeof icalFeeds.$inferInsert> = {},
) {
	const row = {
		id: newId(),
		roomId: ROSE.id,
		source: 'airbnb' as const,
		label: 'Test feed',
		url: `https://feeds.example.test/${newPublicId()}.ics`,
		isActive: true,
		...overrides,
	};
	await db().insert(icalFeeds).values(row);
	return row;
}

export async function insertExternalEvent(
	overrides: Partial<typeof externalEvents.$inferInsert> & { feedId: string },
) {
	const row = {
		id: newId(),
		roomId: ROSE.id,
		uid: `${newPublicId()}@airbnb.test`,
		startDate: '2030-06-10',
		endDate: '2030-06-12',
		kind: 'reserved' as const,
		...overrides,
	};
	await db().insert(externalEvents).values(row);
	return row;
}

export async function insertBlock(
	overrides: Partial<typeof roomBlockedPeriods.$inferInsert> = {},
) {
	const row = {
		id: newId(),
		roomId: ROSE.id,
		startDate: '2030-06-08',
		endDate: '2030-06-10',
		reason: 'Maintenance',
		...overrides,
	};
	await db().insert(roomBlockedPeriods).values(row);
	return row;
}

export async function insertPricingRule(
	overrides: Partial<typeof roomPricingRules.$inferInsert> = {},
) {
	const now = new Date();
	const row = {
		id: newId(),
		roomId: ROSE.id,
		name: 'Fixture rule',
		ruleType: 'absolute_price' as const,
		value: 150,
		startDate: '2030-06-08',
		endDate: '2030-06-10',
		isActive: true,
		activatedAt: now,
		...overrides,
	};
	await db().insert(roomPricingRules).values(row);
	return row;
}

/** Valid createBooking input for ROSE (prices are recomputed server-side). */
export function bookingInput(
	overrides: Partial<{
		roomId: string;
		checkInDate: string;
		checkOutDate: string;
		guestCount: number;
		basePrice: number;
		totalAmount: number;
	}> = {},
) {
	return {
		roomId: ROSE.id,
		checkInDate: '2030-07-01',
		checkOutDate: '2030-07-03',
		guestCount: 1,
		guestName: 'Fixture Guest',
		guestEmail: GUEST.email,
		guestPhone: '5555550100',
		basePrice: 200,
		serviceFee: 24,
		taxAmount: 26,
		totalAmount: 250,
		...overrides,
	};
}
