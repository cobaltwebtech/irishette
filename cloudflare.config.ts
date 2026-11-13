import { bindings, defineConfig, triggers } from 'cf/config';
import * as entrypoint from './src/server.ts' with { type: 'cf-worker' };

// Worker configuration (replaces wrangler.jsonc). Read by `cf` and by
// @cloudflare/vite-plugin v2.
//
// D1 migrations: there is no `migrations_dir` field here. The migration
// directory is passed to the CLI instead (see the db:migrate:* scripts):
//   cf d1 migrations apply <DATABASE_ID> --dir ./drizzle [--local]
// Note: `cf d1` commands target the REMOTE database unless `--local` is passed.
//
// Env values: Varlock (.env.schema) owns them. Every command that needs values
// runs as `varlock run --inject vars -- <cmd>`, which puts them in process.env.
// - Public values (BETTER_AUTH_URL, STRIPE_PUBLISHABLE_KEY) are text bindings
//   read from process.env here.
// - Secrets are declared with bindings.secret() and carry no value here. Local
//   dev reads them from process.env; production values are set with
//   `pnpm dlx wrangler secret put <NAME> --name irishette` or
//   `cf deploy --secrets-file <PATH>`.
// VITE_TURNSTILE_PUBLIC_KEY is a public build-time value inlined by Vite and is
// intentionally not declared here.
//
// Development vs production: one explicit switch, `APP_ENV` (declared in
// .env.schema, `development` by default). Only the `build:prod`, `deploy` and
// `deploy:dry` scripts set `APP_ENV=production`. That single value:
// - makes Varlock also load `.env.production` (production build-time values:
//   BETTER_AUTH_URL, STRIPE_PUBLISHABLE_KEY, VITE_TURNSTILE_PUBLIC_KEY),
// - binds the production D1 database (see D1 below),
// - serves the Worker on the production custom domain and turns workers.dev off.
// `pnpm dev`, `pnpm build` and `pnpm preview` never set it, so they stay on the
// dev database and dev values. `cf build --mode` is not used (TanStack Start
// rejects it).

// tsconfig has no Node types (types: ["vite-plus/client"]); this file runs under
// Node (cf / Vite), where Varlock injects values into process.env.
declare const process: { env: Record<string, string | undefined> };

type AppEnv = 'development' | 'production';
const appEnv: AppEnv =
	process.env.APP_ENV === 'production' ? 'production' : 'development';
const isProduction = appEnv === 'production';

// D1 databases per environment. After creating a new database, change only the
// matching entry here (and the id in the `db:migrate:remote` script in
// package.json, and DATABASE_ID in scripts/d1-local.mjs if you change the dev
// one; local state is keyed by the dev id).
const D1: Record<AppEnv, { name: string; id: string }> = {
	development: {
		name: 'irishette-dev-1',
		id: '2a894e1e-33f0-45ce-88e1-2709f90215a9',
	},
	production: {
		name: 'irishette-prod',
		id: 'bfd93ead-44a5-4541-aba0-6cb72cde7336',
	},
};

// The one production origin. Must equal SITE_URL in src/lib/site.ts and has no
// trailing slash (Better Auth and the server-function CSRF check trust exactly
// this origin). Duplicated here because this file runs under Node before the
// `@/` alias exists.
const PRODUCTION_ORIGIN = 'https://www.irishette.com';
const PRODUCTION_HOST = new URL(PRODUCTION_ORIGIN).hostname;

// Fail the build early if a production build would bake in a dev value. Varlock
// loads `.env.local` for every environment and `.env.production` on top of it,
// so a value missing from `.env.production` silently falls back to the dev one.
function assertProductionValues() {
	const problems: string[] = [];
	if (process.env.BETTER_AUTH_URL !== PRODUCTION_ORIGIN) {
		problems.push(
			`BETTER_AUTH_URL must be exactly ${PRODUCTION_ORIGIN} (no trailing slash)`,
		);
	}
	if (!process.env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_')) {
		problems.push('STRIPE_PUBLISHABLE_KEY must be a live key (pk_live_...)');
	}
	const turnstileKey = process.env.VITE_TURNSTILE_PUBLIC_KEY ?? '';
	// Cloudflare's dummy/test site keys start with 1x0000..., 2x0000..., 3x0000...
	if (!turnstileKey || /^[123]x0{8}/.test(turnstileKey)) {
		problems.push(
			'VITE_TURNSTILE_PUBLIC_KEY must be the production Turnstile site key (not empty or a dummy test key)',
		);
	}
	if (problems.length > 0) {
		throw new Error(
			`APP_ENV=production but .env.production is incomplete:\n- ${problems.join('\n- ')}\nSee docs/GO_LIVE.md.`,
		);
	}
}
if (isProduction) assertProductionValues();

// Public, non-secret values are baked in as text bindings at build time.
// The `as string` cast keeps the generated Env type as `string`.
const publicValue = (name: string) => process.env[name] ?? '';

export default defineConfig({
	worker: {
		name: 'irishette',
		entrypoint,
		compatibilityDate: '2026-11-01',
		compatibilityFlags: ['nodejs_compat'],
		// Production is served only from the custom domain (a string means
		// production traffic). `cf deploy` creates the domain's DNS record and
		// certificate; the irishette.com zone must be on the account.
		workersDev: !isProduction,
		...(isProduction ? { domains: [PRODUCTION_HOST] } : {}),
		// Workers Observability: logs, traces and real-time Issues (issue
		// detection), all sampled at 100%.
		observability: {
			enabled: true,
			headSamplingRate: 1,
			// Strip query strings from logged/traced URLs: password reset and
			// magic link URLs carry single-use tokens in `?token=`.
			redactQueryString: true,
			logs: {
				enabled: true,
				headSamplingRate: 1,
				invocationLogs: true,
				persist: true,
			},
			traces: {
				enabled: true,
				headSamplingRate: 1,
				persist: true,
			},
			issues: { enabled: true },
		},
		// Keep in sync with CRON_SCHEDULES handling in src/lib/server/scheduled-tasks.ts.
		triggers: [
			triggers.scheduled({ schedule: '*/30 * * * *' }), // payment recovery + iCal import sync
			triggers.scheduled({ schedule: '5 8 * * *' }), // expired pending bookings cleanup (08:05 UTC)
			triggers.scheduled({ schedule: '15 9 * * *' }), // iCal sync log + sent-email cleanup (09:15 UTC)
		],
		env: {
			DB: bindings.d1(D1[appEnv]),
			BETTER_AUTH_URL: bindings.text(publicValue('BETTER_AUTH_URL') as string),
			BETTER_AUTH_SECRET: bindings.secret(),
			STRIPE_PUBLISHABLE_KEY: bindings.text(
				publicValue('STRIPE_PUBLISHABLE_KEY') as string,
			),
			STRIPE_SECRET_KEY: bindings.secret(),
			STRIPE_TRPC_WEBHOOK_SECRET: bindings.secret(),
			TURNSTILE_SECRET_KEY: bindings.secret(),

			// Cloudflare Email Service (src/lib/email/email-service.ts). Sender
			// domains are onboarded in the dashboard (Compute > Email Service).
			// `remote: true`: `pnpm dev` sends real email through the account.
			EMAIL: bindings.sendEmail({ dev: { remote: true } }),

			// Rate Limiting (src/lib/security/rate-limit.ts). Approximate, per Cloudflare
			// location; a first filter in front of Better Auth's strict D1 limits.
			// `namespace` must be a positive integer unique within the Cloudflare
			// account (bindings sharing one share counters): 20261-20263 are
			// reserved for this Worker. `period` is 10 or 60 seconds.
			// Keep the 60 s period in sync with RATE_LIMIT_PERIOD_SECONDS.
			AUTH_RATE_LIMITER: bindings.rateLimit({
				namespace: '20261',
				simple: { limit: 30, period: 60 }, // /api/auth/*, per IP
			}),
			API_RATE_LIMITER: bindings.rateLimit({
				namespace: '20262',
				simple: { limit: 60, period: 60 }, // selected tRPC procedures, per user or IP
			}),
			CSP_REPORT_RATE_LIMITER: bindings.rateLimit({
				namespace: '20263',
				simple: { limit: 30, period: 60 }, // /api/csp-report, per IP
			}),
		},
	},
});
