import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterAll, afterEach, beforeAll } from 'vite-plus/test';

import { network } from './network';
import { seed } from './seed';

// Storage is isolated per test file, so every file starts from the migrated,
// seeded database below.
beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await seed();
	network.enable();
});

afterEach(() => network.resetHandlers());

afterAll(() => network.disable());
