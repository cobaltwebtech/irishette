import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createInnerTRPCContext } from '@/integrations/trpc/inner-context';
import { trpcRouter } from '@/integrations/trpc/router';
import { actorKey, isRateLimited } from '@/lib/security/rate-limit';

import { trpcError, useClock } from './helpers';
import { ROSE } from './seed';

// TEST_RATE_LIMITER allows 3 calls per 60 s per key (vitest.config.ts).

const IP = '203.0.113.7';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('isRateLimited', () => {
	it('allows up to the limit, then rejects and logs without the IP', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const testEnv = { ...env, AUTH_RATE_LIMITER: env.TEST_RATE_LIMITER };
		const key = actorKey('test-lib', { ip: IP });
		const results = [];
		for (let i = 0; i < 4; i++) {
			results.push(
				await isRateLimited(testEnv, 'AUTH_RATE_LIMITER', key, {
					path: '/api/auth/sign-in/email',
					ip: IP,
				}),
			);
		}
		expect(results).toEqual([false, false, false, true]);
		expect(warn).toHaveBeenCalledTimes(1);
		const line = String(warn.mock.calls[0][0]);
		expect(JSON.parse(line)).toMatchObject({
			message: 'rate-limited',
			limiter: 'AUTH_RATE_LIMITER',
			path: '/api/auth/sign-in/email',
			ipHash: expect.stringMatching(/^[0-9a-f]{16}$/),
		});
		expect(line).not.toContain(IP);
	});

	it('fails open without a binding', async () => {
		const testEnv = { ...env, AUTH_RATE_LIMITER: undefined } as unknown as Env;
		expect(
			await isRateLimited(testEnv, 'AUTH_RATE_LIMITER', 'k', {
				path: '/x',
				ip: null,
			}),
		).toBe(false);
	});

	it('keys signed-in users by id and others by IP', () => {
		expect(actorKey('s', { userId: 'u1', ip: IP })).toBe('s:user:u1');
		expect(actorKey('s', { ip: IP })).toBe(`s:ip:${IP}`);
		expect(actorKey('s', { ip: null })).toBe('s:ip:unknown');
	});
});

describe('tRPC rateLimit middleware', () => {
	useClock('2036-12-20T17:00:00Z');

	it('bookings.calculateBooking returns TOO_MANY_REQUESTS over the limit', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const ctx = createInnerTRPCContext({
			session: null,
			headers: new Headers({ 'cf-connecting-ip': '198.51.100.9' }),
		});
		const caller = trpcRouter.createCaller({
			...ctx,
			env: { ...ctx.env, API_RATE_LIMITER: env.TEST_RATE_LIMITER },
		});
		const input = {
			roomId: ROSE.id,
			checkInDate: '2037-01-10',
			checkOutDate: '2037-01-12',
			guestCount: 1,
		};
		for (let i = 0; i < 3; i++) {
			await expect(
				caller.bookings.calculateBooking(input),
			).resolves.toHaveProperty('totalAmount');
		}
		const error = await trpcError(caller.bookings.calculateBooking(input));
		expect(error.code).toBe('TOO_MANY_REQUESTS');
	});
});
