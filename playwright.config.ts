import { defineConfig, devices } from '@playwright/test';

// E2E against the local dev server (Chromium only).
//
// `pnpm dev` decrypts secrets with Varlock (Touch ID), so start it yourself
// first and Playwright reuses it. If nothing is listening on :3000,
// Playwright starts `pnpm dev` and waits for it.
//
// Signed-in tests need an existing, verified local account and are skipped
// unless these are set (never commit them):
//   E2E_USER_EMAIL / E2E_USER_PASSWORD     a normal user
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   an admin (pnpm db:make-admin:local)
// The booking test also needs E2E_STRIPE=1 and Stripe sandbox keys. Login
// needs Turnstile to pass; use Cloudflare's test keys locally
// (site key 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA).
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm dev',
		url: BASE_URL,
		reuseExistingServer: true,
		timeout: 180_000,
	},
});
