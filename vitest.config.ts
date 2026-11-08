import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vite-plus';

// Test config, separate from vite.config.ts: the Start, React and Cloudflare
// Vite plugins are not loaded here.
//
// Projects:
// - unit:    pure modules in Node (test/unit/**). TZ=UTC.
// - workers: tRPC procedures, webhooks, cron and the iCal route inside workerd
//            with a local D1 (test/workers/**).
//
// The workers project declares every binding explicitly with test-only values.
// It does not read cloudflare.config.ts (`config` is unset) or any .env file,
// and remote bindings are off.
export default defineConfig({
	// Hides Vite's "sourcemap points to missing source files" noise from
	// dependencies (stripe, superjson). Errors still print.
	logLevel: 'error',
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		// Console output from passing tests is noise (the app logs a lot).
		silent: 'passed-only',
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['test/unit/**/*.test.ts'],
					env: { TZ: 'UTC' },
				},
			},
			{
				extends: true,
				plugins: [
					cloudflareTest(async () => ({
						main: './test/workers/entry.ts',
						remoteBindings: false,
						miniflare: {
							compatibilityDate: '2026-11-01',
							compatibilityFlags: ['nodejs_compat'],
							d1Databases: { DB: 'irishette-test' },
							// Same bindings as cloudflare.config.ts, with limits high enough
							// that other tests never hit them. TEST_RATE_LIMITER is low so
							// rate-limit.test.ts can reach it.
							ratelimits: {
								AUTH_RATE_LIMITER: {
									namespace_id: '20261',
									simple: { limit: 10_000, period: 60 },
								},
								API_RATE_LIMITER: {
									namespace_id: '20262',
									simple: { limit: 10_000, period: 60 },
								},
								CSP_REPORT_RATE_LIMITER: {
									namespace_id: '20263',
									simple: { limit: 10_000, period: 60 },
								},
								TEST_RATE_LIMITER: {
									namespace_id: '29999',
									simple: { limit: 3, period: 60 },
								},
							},
							bindings: {
								TEST_MIGRATIONS: await readD1Migrations('./drizzle'),
								// Test-only values. Never real keys.
								BETTER_AUTH_URL: 'http://localhost:3000',
								BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
								STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
								STRIPE_SECRET_KEY: 'sk_test_x',
								STRIPE_BETTER_AUTH_WEBHOOK_SECRET: 'whsec_test_better_auth',
								STRIPE_TRPC_WEBHOOK_SECRET: 'whsec_test',
								RESEND_API_KEY: 're_test',
								TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
							},
						},
					})),
				],
				test: {
					name: 'workers',
					include: ['test/workers/**/*.test.ts'],
					setupFiles: ['./test/workers/setup.ts'],
				},
			},
		],
	},
});
