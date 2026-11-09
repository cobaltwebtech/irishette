import { describe, expect, it } from 'vite-plus/test';

import { trpcRouter } from '@/integrations/trpc/router';

import { makeCtx, trpcError } from './helpers';

// Sweeps every procedure in the router, so new procedures are covered
// automatically: anything not listed below must reject anonymous callers, and
// anything not user-callable must reject normal users.

/** Procedures anyone may call. Keep this list short and explicit. */
const PUBLIC = new Set([
	'rooms.list',
	'rooms.get',
	'rooms.calculatePricing',
	'bookings.calculateBooking',
	'availability.getBySlug',
	'policies.getCancellationPolicy',
]);

/** Procedures a signed-in normal user may call (they check ownership). */
const USER = new Set([
	'bookings.createBooking',
	'bookings.createCheckoutSession',
	'bookings.refreshBooking',
	'bookings.confirmCheckout',
	'bookings.getBooking',
	'bookings.getMyBookings',
	'bookings.getCancellationQuote',
	'bookings.cancelBooking',
	'bookings.resendConfirmationEmail',
	'users.updateProfile',
]);

/** Removed procedures (plan 01 Phase 7 leaks/placeholders, plan 02 cleanup). */
const REMOVED = [
	'rooms.ping',
	'rooms.getIcalConfig',
	'rooms.generateIcal',
	'rooms.checkAvailability',
	'rooms.bulkAvailability',
	'bookings.updateBooking',
	'bookings.checkAvailability',
	// Plan 02 Phase 3: replaced by createCheckoutSession / confirmCheckout.
	'bookings.createPaymentIntent',
	'bookings.confirmPayment',
	'availability.checkRoom',
	'availability.checkBulk',
	// Plan 02 Phase 1: unused (the admin UI syncs a whole room).
	'ical.syncFeed',
	// Plan 02 Phase 2: merged into users.updateProfile.
	'users.updatePhoneNumber',
];

const paths = Object.keys(trpcRouter._def.procedures).sort();

type Procedure = (input?: unknown) => Promise<unknown>;

/** Calls a procedure by dotted path. Input is deliberately invalid: auth runs first. */
function call(role: 'user' | null, path: string) {
	const ctx = makeCtx(role);
	const caller = trpcRouter.createCaller(ctx) as unknown as Record<
		string,
		Record<string, Procedure>
	>;
	const [router, procedure] = path.split('.');
	return caller[router][procedure](undefined);
}

describe('procedure inventory', () => {
	it('every allowlisted procedure exists', () => {
		for (const path of [...PUBLIC, ...USER]) {
			expect(paths).toContain(path);
		}
	});

	it('removed procedures are gone', () => {
		for (const path of REMOVED) {
			expect(paths).not.toContain(path);
		}
	});
});

describe('anonymous callers', () => {
	const protectedPaths = paths.filter((p) => !PUBLIC.has(p));

	it.each(protectedPaths)('%s rejects with UNAUTHORIZED', async (path) => {
		const error = await trpcError(call(null, path));
		expect(error.code).toBe('UNAUTHORIZED');
	});
});

describe('normal users', () => {
	const adminPaths = paths.filter((p) => !PUBLIC.has(p) && !USER.has(p));

	it.each(adminPaths)('%s rejects with FORBIDDEN', async (path) => {
		const error = await trpcError(call('user', path));
		expect(error.code).toBe('FORBIDDEN');
	});
});
