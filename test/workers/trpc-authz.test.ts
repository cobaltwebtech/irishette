import { describe, expect, it } from 'vitest';
import { trpcRouter } from '@/integrations/trpc/router';
import { makeCtx, trpcError } from './helpers';

// Sweeps every procedure in the router, so new procedures are covered
// automatically: anything not listed below must reject anonymous callers, and
// anything not user-callable must reject normal users.

/** Procedures anyone may call. Keep this list short and explicit. */
const PUBLIC = new Set([
	'rooms.ping',
	'rooms.list',
	'rooms.get',
	'rooms.calculatePricing',
	'rooms.checkAvailability',
	'rooms.bulkAvailability',
	'bookings.calculateBooking',
	'bookings.checkAvailability',
	'availability.getBySlug',
	'availability.checkRoom',
	'availability.checkBulk',
]);

/** Public today but must become admin-only (Phase 7.1). */
const KNOWN_PUBLIC_LEAKS = new Set([
	'rooms.getIcalConfig',
	'rooms.generateIcal',
]);

/** Procedures a signed-in normal user may call (they check ownership). */
const USER = new Set([
	'bookings.createBooking',
	'bookings.createCheckoutSession',
	'bookings.createPaymentIntent',
	'bookings.refreshBooking',
	'bookings.confirmPayment',
	'bookings.getBooking',
	'bookings.getMyBookings',
	'bookings.updateBooking',
	'bookings.cancelBooking',
	'bookings.resendConfirmationEmail',
	'users.updatePhoneNumber',
	'users.updateProfile',
]);

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
		for (const path of [...PUBLIC, ...KNOWN_PUBLIC_LEAKS, ...USER]) {
			expect(paths).toContain(path);
		}
	});
});

describe('anonymous callers', () => {
	const protectedPaths = paths.filter(
		(p) => !PUBLIC.has(p) && !KNOWN_PUBLIC_LEAKS.has(p),
	);

	it.each(protectedPaths)('%s rejects with UNAUTHORIZED', async (path) => {
		const error = await trpcError(call(null, path));
		expect(error.code).toBe('UNAUTHORIZED');
	});

	it.fails.each([...KNOWN_PUBLIC_LEAKS])(
		'%s rejects with UNAUTHORIZED (Phase 7.1)',
		async (path) => {
			const error = await trpcError(call(null, path));
			expect(error.code).toBe('UNAUTHORIZED');
		},
	);
});

describe('normal users', () => {
	const adminPaths = paths.filter((p) => !PUBLIC.has(p) && !USER.has(p));

	it.each(adminPaths.filter((p) => !KNOWN_PUBLIC_LEAKS.has(p)))(
		'%s rejects with FORBIDDEN',
		async (path) => {
			const error = await trpcError(call('user', path));
			expect(error.code).toBe('FORBIDDEN');
		},
	);

	it.fails.each([...KNOWN_PUBLIC_LEAKS])(
		'%s rejects with FORBIDDEN (Phase 7.1)',
		async (path) => {
			const error = await trpcError(call('user', path));
			expect(error.code).toBe('FORBIDDEN');
		},
	);
});
