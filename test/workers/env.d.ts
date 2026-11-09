/// <reference types="@cloudflare/vitest-plugin/types" />

// Test-only bindings declared in vitest.config.ts (workers project).
declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
		/** Low-limit (3 per 60 s) binding for rate-limit.test.ts. */
		TEST_RATE_LIMITER: RateLimit;
	}
}
