# Irishette

Room-booking site for the Irishette Bed & Breakfast (Dublin, Texas): rooms,
availability calendar, bookings with Stripe payments, cancellations and
refunds, guest accounts, an admin area, and two-way iCal sync with Airbnb,
Expedia and other platforms. It runs as a single Cloudflare Worker.

| | |
|---|---|
| Framework | TanStack Start (React 19, Vite 8, React Compiler), TanStack Router / Query / Table / Store |
| API | tRPC v11 (`src/integrations/trpc/`) behind TanStack Start server routes (`src/routes/api/`) |
| Data | Cloudflare D1 with Drizzle ORM (`src/db/`, migrations in `drizzle/`) |
| Auth | Better Auth (email/password, magic link, Turnstile, Stripe customer) |
| Payments | Stripe (PaymentIntents + Payment Element; webhook at `/api/stripe/webhook`) |
| Email | Cloudflare Email Service + react-email (`src/components/email/`) |
| Config | `cloudflare.config.ts` + the `cf` CLI; env contract in `.env.schema` (Varlock) |
| Tooling | pnpm, Vite+ (`vp`: Oxlint, Oxfmt, Vitest), Playwright, Fallow |

Agents and contributors: read [`AGENTS.md`](AGENTS.md) first.

## Setup

Requirements: Node 22.18+ (this repo uses Node 26), pnpm.

```bash
pnpm install
# Secrets: ask for the values, put them in .env.local, then encrypt them in
# place (macOS Secure Enclave): pnpm exec varlock encrypt --file .env.local
pnpm db:reset:local          # local D1: migrate + synthetic seed
pnpm dev                     # http://localhost:3000 (asks for Touch ID to decrypt secrets)
```

Make yourself an admin after signing up locally:

```bash
pnpm db:make-admin:local you@example.com
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server (Vite + local D1) |
| `pnpm build` | Production build into `.cloudflare/output/` |
| `pnpm typecheck` | Regenerate Worker types, then `tsc` (app and e2e) |
| `pnpm check` / `pnpm check:fix` | Vite+: Oxfmt + Oxlint (type-aware) + type check; `:fix` formats and applies safe fixes |
| `pnpm test` | All Vitest tests (`test:unit`, `test:workers`) |
| `pnpm test:e2e` | Playwright (Chromium) against the dev server |
| `pnpm test:smoke` | Quick HTTP checks against a running dev server |
| `pnpm check:bundle` | After a build: no secret names in client assets |
| `pnpm db:generate` | New SQL migration from the Drizzle schema |
| `pnpm db:migrate:local` / `db:seed:local` / `db:reset:local` | Local D1 only |
| `pnpm env:check` / `env:scan` / `env:types` | Varlock: validate env, scan for leaked secrets, regenerate types |
| `pnpm run deploy` | Build and deploy with `cf` (production; ask first) |

## Tests

- **Unit** (`test/unit/`, Node): date rules, pricing, iCal parse/generate,
  cancellation policy, validation, ids, booking store.
- **Workers** (`test/workers/`, workerd via `@cloudflare/vitest-plugin`):
  tRPC procedures (auth sweep, leaks, bookings, payments, pricing rules,
  blocks, cancellations), the Stripe webhook, the iCal export route and the
  cron handlers. Local D1 with migrations, test-only bindings, and msw for
  Stripe and feed URLs, and a stub for the `EMAIL` binding (unmocked requests and email sends fail).
- **E2E** (`e2e/`, Playwright): hard reloads, auth redirects, the calendar.
  Signed-in tests need `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` (and the admin
  equivalents); the Stripe booking test also needs `E2E_STRIPE=1`. See
  `playwright.config.ts`.

## Environment and deploys

`.env.schema` declares every variable (Varlock); real values live only in the
gitignored, encrypted `.env.local`. `cloudflare.config.ts` declares the Worker
bindings. Production secrets are set with
`pnpm dlx wrangler secret put <NAME> --name irishette`. Details, and the rules
for remote D1 and deploys, are in [`AGENTS.md`](AGENTS.md).

## Docs

Feature notes are in `docs/`. Start with `BOOKING_ARCHITECTURE.md`,
`TRPC_QUICK_REFERENCE.md`, `ICAL_SYNC_README.md` and `CRON_JOBS_SETUP.md`.
