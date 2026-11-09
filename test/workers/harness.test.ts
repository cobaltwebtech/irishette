import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vite-plus/test';

import { caller } from './helpers';
import { ROSE } from './seed';

describe('workers test harness', () => {
	it('uses the test-only bindings', () => {
		expect(env.STRIPE_SECRET_KEY).toBe('sk_test_x');
		expect(env.STRIPE_TRPC_WEBHOOK_SECRET).toBe('whsec_test');
	});

	it('migrates and seeds D1', async () => {
		const room = await caller(null).rooms.get({ publicId: ROSE.publicId });
		expect(room.slug).toBe(ROSE.slug);
	});

	it('fails unmocked outbound requests', async () => {
		await expect(fetch('https://unmocked.example.test/')).rejects.toThrow();
	});
});
