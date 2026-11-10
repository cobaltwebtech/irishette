import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { AppSession } from '@/lib/auth/session-user';

// getSessionFn is a server function (Better Auth, cloudflare:workers). The
// guards only read the per-request QueryClient here, which the tests seed.
vi.mock('@/core/functions/auth-server', () => ({ getSessionFn: vi.fn() }));

const { optionalAuth, requireAdmin, requireAuth, requireNoSession } =
	await import('@/lib/auth/auth-check');
const { freshSessionQueryOptions, sessionQueryOptions } =
	await import('@/lib/auth/session');

const user = {
	id: 'u1',
	publicId: 'abcdefghij012345',
	name: 'Guest',
	email: 'guest@example.test',
	image: null,
	role: 'user',
	emailVerified: true,
	phoneNumber: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
};

function contextWith(session: AppSession, fresh: AppSession = session) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(sessionQueryOptions().queryKey, session);
	queryClient.setQueryData(freshSessionQueryOptions().queryKey, fresh);
	return { queryClient };
}

/** The redirect a guard throws, as { href } or { to, search }. */
async function thrownRedirect(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (isRedirect(error)) return error.options;
		throw error;
	}
	throw new Error('Expected a redirect');
}

describe('requireNoSession', () => {
	it('lets signed-out visitors stay', async () => {
		await expect(
			requireNoSession({
				context: contextWith(null),
				search: { redirect: '/account' },
			}),
		).resolves.toBeUndefined();
	});

	it('sends a signed-in user to a safe redirect', async () => {
		const options = await thrownRedirect(
			requireNoSession({
				context: contextWith({ user }),
				search: { redirect: '/booking/confirmation/abc?x=1' },
			}),
		);
		expect(options.href).toBe('/booking/confirmation/abc?x=1');
	});

	it.each([
		'https://evil.example',
		'//evil.example/path',
		'/\\evil.example',
		'javascript:alert(1)',
		'/ok\u0000',
	])('ignores the unsafe redirect %j', async (unsafe) => {
		const options = await thrownRedirect(
			requireNoSession({
				context: contextWith({ user }),
				search: { redirect: unsafe },
			}),
		);
		expect(options.href).toBe('/account');
	});

	it('uses /account without a redirect', async () => {
		const options = await thrownRedirect(
			requireNoSession({ context: contextWith({ user }), search: {} }),
		);
		expect(options.href).toBe('/account');
	});
});

describe('requireAuth / requireAdmin / optionalAuth', () => {
	const location = { href: '/account/past-bookings?page=2' };

	it('requireAuth returns the user or redirects to login with the href', async () => {
		await expect(
			requireAuth({ context: contextWith({ user }), location }),
		).resolves.toEqual(user);
		const options = await thrownRedirect(
			requireAuth({ context: contextWith(null), location }),
		);
		expect(options).toMatchObject({
			to: '/auth/login',
			search: { redirect: location.href },
		});
	});

	it('requireAdmin uses the fresh session: non-admins go to /', async () => {
		const admin = { ...user, role: 'admin' };
		// Cached session says admin, the fresh read says the role was revoked.
		const options = await thrownRedirect(
			requireAdmin({
				context: contextWith({ user: admin }, { user }),
				location,
			}),
		);
		expect(options).toMatchObject({ to: '/' });
		await expect(
			requireAdmin({ context: contextWith(null, { user: admin }), location }),
		).resolves.toEqual(admin);
	});

	it('optionalAuth never redirects', async () => {
		await expect(optionalAuth({ context: contextWith(null) })).resolves.toBe(
			null,
		);
		await expect(
			optionalAuth({ context: contextWith({ user }) }),
		).resolves.toEqual(user);
	});
});
