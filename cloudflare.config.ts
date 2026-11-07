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

// tsconfig has no Node types (types: ["vite/client"]); this file runs under
// Node (cf / Vite), where Varlock injects values into process.env.
declare const process: { env: Record<string, string | undefined> };

// Public, non-secret values are baked in as text bindings at build time.
// The `as string` cast keeps the generated Env type as `string`.
const publicValue = (name: string) => process.env[name] ?? '';

export default defineConfig({
	worker: {
		name: 'irishette',
		entrypoint,
		compatibilityDate: '2026-11-01',
		compatibilityFlags: ['nodejs_compat'],
		workersDev: true, // false when going to production with a custom domain
		observability: { enabled: true },
		// Keep in sync with CRON_SCHEDULES handling in src/lib/scheduled-tasks.ts.
		triggers: [
			triggers.scheduled({ schedule: '*/30 * * * *' }), // iCal import sync
			triggers.scheduled({ schedule: '5 8 * * *' }), // expired pending bookings cleanup (08:05 UTC)
			triggers.scheduled({ schedule: '15 9 * * *' }), // iCal sync log cleanup (09:15 UTC)
		],
		env: {
			DB: bindings.d1({
				name: 'irishette-dev',
				id: '7a52bbfc-592e-4792-990e-6a5e51ca8cbd',
			}),
			BETTER_AUTH_URL: bindings.text(publicValue('BETTER_AUTH_URL') as string),
			BETTER_AUTH_SECRET: bindings.secret(),
			STRIPE_PUBLISHABLE_KEY: bindings.text(
				publicValue('STRIPE_PUBLISHABLE_KEY') as string,
			),
			STRIPE_SECRET_KEY: bindings.secret(),
			STRIPE_BETTER_AUTH_WEBHOOK_SECRET: bindings.secret(),
			STRIPE_TRPC_WEBHOOK_SECRET: bindings.secret(),
			RESEND_API_KEY: bindings.secret(),
			TURNSTILE_SECRET_KEY: bindings.secret(),
		},
	},
});
