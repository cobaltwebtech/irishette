import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vite-plus/test';

import { resetEmail } from './mocks';
import { network } from './network';
import { seed } from './seed';

// Storage is isolated per test file, so every file starts from the migrated,
// seeded database below.
beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await seed();
	network.enable();
});

// Email dedupe claims and alert throttle slots must not leak between tests.
beforeEach(async () => {
	resetEmail();
	await env.DB.prepare('DELETE FROM sent_emails').run();
});
afterEach(() => network.resetHandlers());

afterAll(() => network.disable());
