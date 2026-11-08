# AGENTS.md

Guidance for AI coding agents working in this repository. Read this first, then load the relevant skill (see [Skills](#skills)) before touching that area.

## Project overview

Irishette is a room-booking site (rooms, availability, bookings, payments, admin, iCal sync) deployed as a single Cloudflare Worker.

| Concern | Choice |
|---|---|
| Package manager | **pnpm** (never npm/yarn; never commit `package-lock.json`/`yarn.lock`) |
| Framework | TanStack Start (React 19, Vite 8, React Compiler via the Rust port `oxc-transform-react`, enabled with `react({ compiler })` in `@vitejs/plugin-react`; no Babel. Pin `oxc-transform-react` inside the plugin's peer range) |
| Routing / data | TanStack Router (file-based), TanStack Query, TanStack Table, TanStack Store |
| API | tRPC v11 (`src/integrations/trpc/`) served through TanStack Start server routes in `src/routes/api/` |
| Auth | Better Auth + `@better-auth/stripe` + Drizzle adapter (`src/lib/auth.ts`) |
| Payments | Stripe (`src/lib/payment-service.ts`, webhooks in `src/routes/api/stripe.$.ts`) |
| Database | Cloudflare D1 (binding `DB`) via Drizzle ORM (SQLite dialect) |
| Other bindings | KV `KV_ICAL_SYNC_LOG`; cron triggers (see `cloudflare.config.ts`) |
| Email | Resend + react-email templates in `src/components/email/` |
| Bot protection | Cloudflare Turnstile |
| Env / secrets | **Varlock** (`.env.schema` contract, generated `varlock.d.ts`, local encryption). Cloudflare config via `cf` + `cloudflare.config.ts`; no Wrangler config, no Varlock Cloudflare/Vite integrations (see [Secrets and environment](#secrets-and-environment-varlock)) |
| UI | Tailwind CSS v4, shadcn/ui (new-york, Stone) + Radix, `sonner` toasts |
| Validation | Zod v4 |
| Toolchain | **Vite+** (`vite-plus`, `vp` CLI): Oxlint (type-aware) + Oxfmt + Vitest 5 behind `vp check` / `vp test`. Config lives in `vite.config.ts` (`lint`, `fmt` blocks). `vite` is an alias of `@voidzero-dev/vite-plus-core` (see [Vite+ notes](#vite-notes)). Biome is removed. |
| Code review / dead code | **Fallow** (global CLI) |

Path alias: `@/*` -> `src/*`. TypeScript is `strict` with `noUnusedLocals` / `noUnusedParameters`.

## Commands

Always run project tools through `pnpm` (`vp`, drizzle-kit, tsc, `cf`, Varlock are **not** guaranteed on the global PATH; use `pnpm exec <tool>` for ad-hoc calls). Wrangler is not a dependency; see [CLI tools](#cli-tools).

```bash
pnpm install                 # install deps
pnpm dev                     # varlock run --inject vars -> cf dev (Vite on :3000, local D1/KV). Asks the user for Touch ID/password to decrypt secrets.
pnpm build                   # varlock run --inject vars -> cf build (output in .cloudflare/output/)
pnpm preview                 # varlock run --inject vars -> vite preview
pnpm run deploy              # varlock run --inject vars -> cf deploy  (ASK THE USER FIRST). Must be `pnpm run deploy`: bare `pnpm deploy` is a pnpm built-in.
pnpm deploy:dry              # same, with --dry-run
pnpm clean                   # removes dist, .tanstack, src/routeTree.gen.ts
pnpm types                   # cf workers types: regenerate Worker `Env` types in .cloudflare/types/ from cloudflare.config.ts
pnpm tail                    # wrangler tail irishette (the one allowed Wrangler use besides `secret put`; streams live logs)

pnpm db:generate             # drizzle-kit generate (new SQL migration in drizzle/)
pnpm db:migrate:local        # apply ./drizzle to the LOCAL D1 (scripts/d1-local.mjs always passes --local)
pnpm db:seed:local           # seed local D1
pnpm db:make-admin:local     # promote an existing local user to admin
pnpm db:reset:local          # wipe local D1, re-migrate, re-seed
pnpm db:migrate:remote       # cf d1 migrations apply on the REMOTE database (ASK THE USER FIRST)

pnpm env:check               # varlock load --agent: validate schema + resolve values (sensitive values redacted)
pnpm env:scan                # varlock scan: fail if sensitive values appear in plaintext in tracked/unignored files
pnpm env:types               # varlock codegen: regenerate varlock.d.ts from .env.schema
pnpm check:bundle            # after a build: fail if secret variable names appear in client assets

pnpm check                   # vp check: Oxfmt check + Oxlint + type-aware type check (read-only; preferred gate before finishing)
pnpm check:fix               # vp check --fix: format, sort imports/Tailwind classes, apply safe lint fixes
pnpm lint                    # vp lint
pnpm format                  # vp fmt (writes)
pnpm typecheck               # cf workers types && tsc --noEmit (also covers e2e); `vp check` type-checks too but does not regenerate Worker types
pnpm test                    # vp test run (unit + workers projects)
```

Notes:
- `README.md` mentions ESLint/Prettier/`pnpm check`/`pnpm start`; that is stale. Vite+ (Oxlint + Oxfmt) is the only linter/formatter.
- `src/routeTree.gen.ts`, `varlock.d.ts` and `.cloudflare/types/` (Worker `Env` types) are generated. Never hand-edit them. `.cloudflare/` is gitignored; `varlock.d.ts` is committed.
- `docs/CLAUDE.md` is an older, partially stale overview. Prefer this file when they conflict.

## Code style (Vite+: Oxlint + Oxfmt)

Config is the `fmt` and `lint` blocks in `vite.config.ts`. Oxfmt is scoped to code (it ignores docs, `.agents`, `drizzle/`, root manifests and generated files); Oxlint runs on the same tree.

- **Tabs** for indentation, **single quotes** for JS/TS (CSS keeps double quotes), print width 80.
- Oxfmt sorts imports (`@/` is internal) and Tailwind classes (in `class`/`className` and `cn`/`cva`/`clsx` calls, using `src/styles/styles.css`). Run `pnpm check:fix` to apply; do not hand-sort.
- Lint: Oxlint with the `typescript`, `unicorn`, `oxc`, `react`, `jsx-a11y` plugins, `correctness` as errors, plus type-aware rules (`typeAware`/`typeCheck`). `react/purity` and `react/set-state-in-effect` are warnings (known follow-ups); do not add new violations.
- Suppress with `// oxlint-disable-next-line <rule> -- <reason>` and always give a reason.
- Fire-and-forget promises need `void` (`typescript/no-floating-promises`).
- Do not add ESLint, Prettier or Biome, or their config files. Do not reformat unrelated files; run `pnpm check:fix` and review the diff.
- `vp dev`/`vp build`/`vp test` are Vite+ built-ins. `vp run <script>` (or `pnpm <script>`) runs a `package.json` script. This repo's dev/build/deploy go through `cf`, not `vp dev`/`vp build`.
- Use `import type` for type-only imports and the `@/` alias for cross-directory imports.

### Vite+ notes

- `package.json` does not declare `vite` (the documented layout for pnpm: `vite-plus` brings the core). `pnpm-workspace.yaml` aliases `vite` to `@voidzero-dev/vite-plus-core` via a catalog + `overrides` so every plugin resolves that one copy; do not re-add a direct real `vite` (two Vite copies break `vp`, typecheck and the workers tests). Ambient types come from `vite-plus/client` (tsconfig `types` and `src/routes/__root.tsx`), not `vite/client`. The core alias is pinned in the catalog, and `vitest` is pinned to the version bundled in `vite-plus`. Keep `vite-plus`, the `vite` alias and `vitest` in lockstep; upgrade with `vp migrate`/the Vite+ upgrade guide, not by bumping one of them alone.
- Imports in config files (`vite.config.ts`, `vitest.config.ts`) come from `vite-plus`; tests import from `vite-plus/test`.
- Keep `@vitejs/plugin-react` ^6.1+ and a pinned `oxc-transform-react` (inside the plugin's peer range).

## Architecture map

```
src/server.ts            Custom Worker entry: fetch -> TanStack Start handler; scheduled -> handleScheduledEvent. DO NOT DELETE.
src/start.tsx, router.tsx  TanStack Start / Router setup (Query SSR integration)
src/routes/              File-based routes (admin/, account/, auth/, booking/, rooms/, api/)
src/routes/api/          Server routes: auth.$ (Better Auth), trpc.$ (tRPC), stripe.$ (webhooks), ical.$ (iCal feeds)
src/integrations/trpc/   init.ts (context, public/protected procedures), router.ts, bookings/rooms/users/availability routers
src/integrations/tanstack-query/  Query client + providers
src/core/functions|middleware/    TanStack Start server functions + middleware
src/lib/                 Services and validation: auth, auth-client, payment-service, email-service, ical-service, scheduled-tasks, *-validation (Zod)
src/db/                  Drizzle schemas (auth-, booking-, room-), schema-export.ts, drizzle-init.ts
src/components/          UI (ui/ = shadcn, admin/, booking/, email/)
src/stores/              TanStack Store booking state
drizzle/                 Generated SQL migrations (applied via `cf d1 migrations apply`)
scripts/                 d1-local.mjs (local D1 helpers), smoke.mjs, check-client-bundle.mjs (post-build secret-name check)
cloudflare.config.ts     Worker config (bindings, cron triggers, compat flags). Replaces wrangler.jsonc.
docs/                    Feature/architecture notes (see below)
db-copy/                 Local DB dumps (gitignored; never commit or edit)
```

Conventions:
- Server-only env access uses `import { env } from 'cloudflare:workers'` (see `src/lib/auth.ts`). Do not use `process.env` for Worker secrets, and never import server-only modules into client code.
- tRPC: use `publicProcedure` / `protectedProcedure` from `src/integrations/trpc/init.ts`; validate every input with Zod (schemas live in `src/lib/*-validation.ts`); register new routers in `src/integrations/trpc/router.ts`. Admin-only logic must check the user role server-side.
- Client data fetching uses `@trpc/tanstack-react-query` + TanStack Query; prefer route loaders / `ensureQueryData` for SSR.
- Do not call Stripe, D1, or Better Auth server APIs from components; go through tRPC procedures, server functions, or `src/lib` services.
- The React Compiler is enabled: avoid manual `useMemo`/`useCallback` unless there is a measured reason; follow the Rules of React.

### Existing docs worth reading before changing an area

`docs/` has per-feature notes. Check the matching one first:
- Booking: `BOOKING_ARCHITECTURE.md`, `BOOKING_QUICK_REFERENCE.md`, `BOOKING-STORE-README.md`
- tRPC: `TRPC_PROCEDURES_REFERENCE.md`, `TRPC_QUICK_REFERENCE.md`, `TRPC_SECURITY_IMPLEMENTATION.md`
- Auth: `SECURE_AUTH_IMPLEMENTATION.md`, `AUTH_CHECK_UTILITIES.md`, `TANSTACK_QUERY_AUTH_INTEGRATION.md`
- Stripe: `STRIPE_PAYMENT_INTEGRATION.md`, `STRIPE_WEBHOOK_SETUP.md`, `STRIPE_WEBHOOK_SECURITY.md`, `STRIPE_WEBHOOK_REFERENCE.md`
- Cron / iCal: `CRON_JOBS_SETUP.md`, `TESTING_CRON_JOBS_LOCALLY.md`, `ICAL_SYNC_README.md`

These may lag the code; verify against the source.

## Database (D1 + Drizzle)

- Schema source of truth: `src/db/*-schema.ts`, aggregated in `src/db/schema-export.ts` (used by `drizzle.config.ts`). Add new schema files to that export.
- Never hand-edit files in `drizzle/` or `drizzle/meta/`.
- Workflow:
  1. Edit schema in `src/db/`.
  2. `pnpm drizzle-kit generate` (writes a new SQL migration into `drizzle/`).
  3. Review the generated SQL. D1/SQLite has limited `ALTER TABLE` support.
  4. Apply locally: `pnpm db:migrate:local` (wraps `cf d1 migrations apply <DATABASE_ID> --dir ./drizzle --local`).
  5. Remote (`pnpm db:migrate:remote`) only with explicit user approval. `cf d1` commands target the **remote** database unless `--local` is passed, so always include `--local` for ad-hoc commands. Remote needs `cf auth login`.
- Never run `drizzle-kit migrate` or `push` against D1 (see `drizzle.config.ts`); drizzle-kit is for `generate`, `check` and `studio` only.
- Better Auth tables live in `src/db/auth-schema.ts`; keep them in sync with Better Auth plugin changes.
- Local D1 state lives in `.cloudflare/state/` (gitignored), shared by `pnpm dev` and `scripts/d1-local.mjs`. Inspect local data with `pnpm db:studio` or the Local Explorer (see `workers-development` skill).
- `cloudflare.config.ts` binds the D1 database `irishette-dev`. Treat any remote command as touching real data.

## Secrets and environment (Varlock)

Varlock owns the env contract, validation, types and local secret encryption. `cloudflare.config.ts` owns the Worker bindings. Do **not** add `wrangler.jsonc`, `varlock-wrangler`, `varlockCloudflareVitePlugin()`, `@varlock/cloudflare-*`, or the plain Varlock Vite plugin, and do not use 1Password plugins; the `cf` CLI is not supported by Varlock's Cloudflare integration, and secrets are encrypted locally instead.

Files:
- `.env.schema` (**committed**): declares every variable with `@public` / sensitive (default) decorators, types and docs. It holds **no secret values, so agents may read and edit it.** Never put a sensitive literal default in it; `varlock scan` flags that.
- `varlock.d.ts` (**committed**, generated): typed `ENV`. Regenerate with `pnpm env:types` after editing the schema. Never hand-edit.
- `.env.local` (**gitignored**): real values. Sensitive values are encrypted in place with `varlock encrypt --file .env.local` (macOS Secure Enclave; the key is bound to the user's Mac, and each decrypt asks for Touch ID or a password).
- Every other `.env*` file and `.dev.vars*` is gitignored. `vite.config.ts` sets `envDir: false`, so Vite and the Cloudflare plugin never read them; Varlock is the only source.

Rules for agents:
- **Never read `.env`, `.env.local` or any other `.env*` file other than `.env.schema`.** Never print, `cat`, `reveal` or `printenv` secret values, and never write decrypted values to disk or into tracked files.
- Check config with `pnpm env:check` (redacted). It triggers a Touch ID prompt, so tell the user first. Note `varlock load --format json` prints `@public` values in plain text; that is fine, but do not use it on sensitive ones.
- Do not run `varlock encrypt` or `varlock reveal` yourself. The user runs them.
- Do not change `@public` / sensitive markings without asking. A secret marked `@public` will be printed, bundled or unencrypted.
- When adding a variable: add it to `.env.schema`, run `pnpm env:types`, then declare it in `cloudflare.config.ts` (`bindings.secret()` for sensitive, `bindings.text(publicValue('NAME') as string)` for `@public`). Add secrets to `SECRET_NAMES` in `scripts/check-client-bundle.mjs`. Ask the user to add the value to `.env.local`.

How values reach the app:
- Every command that needs values runs as `varlock run --inject vars -- <cmd>` (the `dev`, `build`, `preview`, `deploy` scripts already do; run the last as `pnpm run deploy`). `cloudflare.config.ts` reads `process.env`.
- `@public` server values (`BETTER_AUTH_URL`, `STRIPE_PUBLISHABLE_KEY`) become **text bindings baked in at build time**; build with the right values. If they are unset at build time, `publicValue()` silently gives an empty string.
- Secrets are `bindings.secret()` with no value in config. Local dev reads them from `process.env`; a missing one only logs a warning in `cf dev`, so run `pnpm env:check`.
- Production secrets are **not** uploaded by Varlock. The user sets them with `pnpm dlx wrangler secret put <NAME> --name irishette` (interactive) or `cf deploy --secrets-file <PATH>`. Do not script a secrets file from decrypted values without asking.
- `VITE_TURNSTILE_PUBLIC_KEY` is a build-time Vite value (read as `import.meta.env.VITE_TURNSTILE_PUBLIC_KEY`, marked `@public`). Do not add `VITE_` to a secret.
- Server-only code reads bindings with `import { env } from 'cloudflare:workers'`.

Modes: `cf build --mode` is rejected for TanStack Start. For a non-default mode use `varlock run --inject vars -- vite build --mode <m>` then `cf deploy --prebuilt --mode <m>`. Varlock's `APP_ENV` (when added) is independent of the cf/Vite mode.

Variables: public `BETTER_AUTH_URL`, `STRIPE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_PUBLIC_KEY`; sensitive `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_BETTER_AUTH_WEBHOOK_SECRET`, `STRIPE_TRPC_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`.

## CLI tools

| Tool | How to run | Use for |
|---|---|---|
| `cf` (Cloudflare CLI, beta) | `pnpm exec cf ...` (also installed as a project dependency) | **Default for everything Cloudflare**: dev, build, deploy, D1, KV, types, `cf cli search`, `cf schema`. Config lives in `cloudflare.config.ts`. Run `cf <cmd> --help` before guessing flags. |
| Wrangler | `pnpm dlx wrangler ...` (not a dependency) | Only where `cf` has no equivalent: `wrangler secret put <NAME> --name irishette` (interactive) and `pnpm tail`. There is no `wrangler.jsonc`; do not run Wrangler config, dev, build or types commands. |
| Stripe CLI | `stripe ...` (global, `/opt/homebrew/bin/stripe`) | `stripe listen --forward-to localhost:3000/api/...` for webhooks, `stripe trigger`, test-mode inspection |
| Vite+ (`vp`) | `pnpm check`, `pnpm exec vp ...` | Lint, format, type check, tests |
| Fallow | `fallow ...` (global) | Dead code, duplication, architecture, audit/review (see below) |
| drizzle-kit | `pnpm drizzle-kit ...` | Migration generation |
| shadcn | `pnpm dlx shadcn@latest add <component>` | Add UI components (also available via the `shadcn` MCP in `.mcp.json`) |

Rules:
- Stripe: use **test mode** only. Never run live-mode or destructive Stripe commands without explicit approval.
- Cloudflare: prefer local (`--local`) operations. Ask before any remote `cf d1`/`cf kv` command, `deploy`, `secret put/delete`, `d1 delete`, or anything that changes live resources.
- For Cloudflare docs, use the `cloudflare-docs` MCP (`opencode.jsonc`) or the skills below instead of relying on memory; Workers APIs change.

## Skills

Skills are installed in **`.agents/skills/`** (locked in `skills-lock.json`; `.claude/skills/` symlinks to the same directories). Read the relevant `SKILL.md` before starting work in its area.

| Area | Skill (`.agents/skills/<name>/SKILL.md`) |
|---|---|
| Writing/reviewing Worker code | `workers-best-practices` |
| Running/debugging locally, logs, Local Explorer | `workers-development` |
| CPU/memory profiling of the deployed Worker | `workers-profiling` |
| Cloudflare `cf` CLI (primary CLI here), choosing cf vs Wrangler | `cf-cli` |
| Wrangler commands (only `secret put` / `tail` here; the skill targets projects with a `wrangler.jsonc`, which this repo does not have) | `wrangler` |
| Picking Cloudflare products, Cloudflare error pages | `cloudflare` |
| Getting bindings/secrets/data working locally | `cloudflare-app-bootstrap` |
| Cloudflare Email Sending / Routing | `cloudflare-email-service` |
| Turnstile setup/repair (client + Siteverify) | `turnstile-spin` |
| Stripe integration decisions (Checkout vs PaymentIntents, etc.) | `stripe-best-practices` |
| Stripe docs/API lookup (prefer over WebFetch/curl) | `stripe-docs` |
| Stripe API/SDK version upgrades | `upgrade-stripe` |
| Dead code, duplication, architecture, audit | `fallow` |
| Reviewing a diff/PR | `fallow-review` |
| Fallow install/config/CI/agent hooks | `fallow-setup` |
| Fallow Cloud runtime coverage | `fallow-cloud-setup` (only if the user asks) |

Not applicable here (do not use): `cargo-fallow` (Rust), `fallow-codex-onboarding` (Codex-specific).

Also see `.claude/agents/` for `shadcn-ui-builder` and `tanstack-server-functions` agent prompts (TanStack server function conventions: Zod schema passed to `.validator()`, composed middleware).

### TanStack skills (live in `node_modules`, not `.agents/skills/`)

TanStack ships its skills inside its npm packages, in a `skills/` directory next to each package's `package.json`. They are not installed into `.agents/skills/`. Do **not** rely on TanStack Intent (`@tanstack/intent`) to find them; it does not reliably point agents at the right files. Instead, before working on a TanStack library, locate and read the matching `SKILL.md` directly (and any sub-skill it links to).

Important: the skills are usually in the **underlying core package**, not the `@tanstack/react-*` wrapper you import from, and pnpm only hoists direct dependencies to `node_modules/@tanstack/`. Core packages such as `router-core` are **not** at `node_modules/@tanstack/router-core`. Find them in the pnpm store:

```bash
# list every TanStack skill available for the installed versions
ls -d node_modules/@tanstack/*/skills node_modules/.pnpm/@tanstack+*/node_modules/@tanstack/*/skills
# or, with the Glob tool:
#   node_modules/.pnpm/@tanstack+*/node_modules/@tanstack/*/skills/**/SKILL.md
```

Library -> where its skills are (verified against the currently installed versions; re-check after upgrades, as packages and skill names change):

| Working on | Skill location (relative to `node_modules/.pnpm/<pkg>@<version>.../node_modules/@tanstack/<pkg>/skills/`) |
|---|---|
| TanStack Start (setup, SSR, server components, Next.js migration) | `react-start` (`node_modules/@tanstack/react-start/skills/` works directly): `react-start/SKILL.md`, `react-start/server-components/`, `lifecycle/migrate-from-nextjs/` |
| Start server functions, middleware, server routes, execution model, deployment (`src/core/`, `src/routes/api/`) | `start-client-core`: `start-core/SKILL.md` plus `server-functions/`, `middleware/`, `server-routes/`, `execution-model/`, `deployment/` |
| Start server runtime (request handling, `src/server.ts`) | `start-server-core`: `start-server-core/SKILL.md` |
| TanStack Router (routes, loaders, search/path params, navigation, auth guards, code splitting, SSR, errors/not-found, type safety) | `router-core`: `router-core/SKILL.md` plus `auth-and-guards/`, `code-splitting/`, `data-loading/`, `navigation/`, `not-found-and-errors/`, `path-params/`, `search-params/`, `ssr/`, `type-safety/` |
| Router Vite plugin / file-route generation (`routeTree.gen.ts`) | `router-plugin`: `router-plugin/SKILL.md` |
| Virtual file routes | `virtual-file-routes`: `virtual-file-routes/SKILL.md` |
| TanStack Query, Table, Store, `react-router-ssr-query` | No shipped skills in the installed versions. Use the package `README.md`/`src/` and the official docs. |

Rules:
- Read the relevant `SKILL.md` first, then follow its links to sub-skills. Prefer it over memory and over generic docs; TanStack Start and Router APIs change quickly.
- Resolve paths with a glob on the version (`@tanstack+router-core@*`) rather than hard-coding a version directory, since the directory name includes the version and peer-dependency hash.
- If a skill is missing, check the installed version (`pnpm ls @tanstack/react-router @tanstack/react-start`); older releases may not ship skills. Say so rather than guessing.
- These files are read-only dependency contents. Never edit anything under `node_modules/`.

## Required workflow after building

After any non-trivial change (new feature, refactor, deletion, dependency change), run in this order and fix what you introduced:

1. `pnpm check:fix`, then `pnpm check` (must exit 0)
2. `pnpm typecheck` (regenerates Worker types, then `tsc --noEmit`)
3. `pnpm build`, then `pnpm check:bundle`
4. If you touched env or secrets: `pnpm env:scan` (and `pnpm env:check`, after telling the user it triggers Touch ID)
5. **Fallow review** (below)

Do not claim a task is done until these pass, or state clearly which step failed and why.

## Fallow (code review after building)

Fallow is installed **globally** (`fallow`). Load the `fallow` and `fallow-review` skills for the full rules. Fallow does not replace Oxlint/Oxfmt (style) or `tsc` (types); it covers dead code, duplication, circular dependencies, complexity, and architecture.

Agent rules (from the skills):
- Always use `--format json --quiet`; parse stdout as JSON; keep stderr separate (no `2>&1`).
- Exit `0` = no enforced gate failed, `1` = findings failed a gate (an analysis result, not a crash), `2`+ = tool/config error.
- Never run `fallow watch`. Never run `fallow telemetry enable`. Do not add remote `extends` URLs to Fallow config.
- Always `fallow fix --dry-run` first; `fallow fix --yes` only after the user agrees to the preview. Do not auto-fix wholesale while tuning is incomplete.
- Set `FALLOW_AGENT_SOURCE` to your agent name (e.g. `opencode`, `claude_code`) if you set it at all.
- Keep temp output (guides, judgments) outside the repo, e.g. `${TMPDIR:-/tmp}`.

Post-build review commands:

```bash
fallow doctor --format json --quiet                      # preflight; fix any "fail" check before trusting results
fallow audit --format json --quiet --base main           # gate: issues introduced vs main (verdict pass/warn/fail)
fallow review --base main --brief                        # orientation brief for the diff; always exits 0
fallow architecture --format json --quiet                # cycles/boundaries, after structural changes
fallow guard <files>                                     # before editing, check which architecture rules apply
```

Before deleting anything Fallow calls "unused", trace it first:

```bash
fallow dead-code --trace <file>:<export> --format json --quiet
fallow dead-code --trace-dependency <package> --format json --quiet
```

Report to the user: the audit verdict, new findings you introduced (fixed or justified), and any findings you judged to be false positives (with reason).

### Fallow tuning status: NOT YET TUNED

Fallow is running on defaults (no `.fallowrc.json` exists; `fallow config --path` exits 3). **Expect false positives.** Do not treat a raw Fallow finding as proof of dead code, and do not delete files/exports/dependencies just because it was reported. Observed on the first default run (93 issues):

- `src/components/ui/*`: ~31 "unused exports". These are shadcn primitives kept as a component library. Likely noise.
- `src/integrations/tanstack-query/devtools.tsx` reported unused: probably referenced via root route/devtools wiring that the analysis misses; verify with `--trace-file`.
- `@tailwindcss/vite` reported "test-only dependency": false positive (it is used in `vite.config.ts`).
- `@iconify/react` flagged as a dev dependency used in production code: a legitimate finding about `package.json` placement, but confirm bundling intent before moving it.
- `src/core/middleware/example-middleware.ts`, `src/lib/booking-validation.ts`, `src/lib/room-validation.ts`/`payment-validation.ts` exports/types: may be real dead code or scaffolding; confirm with `--trace` before removing.
- Boundaries and rule packs are not configured, so the architecture check is effectively off (`boundaries-not-configured`).

Likely sources of false positives to keep in mind (verify each, do not assume):
- TanStack Start/Router: route files export `Route`; `src/routeTree.gen.ts`, `src/start.tsx`, `src/router.tsx`, `src/server.ts` are framework entry points.
- The `cloudflare:workers` virtual module and Worker `Env` types generated into `.cloudflare/types/`.
- Drizzle schema exports consumed only by `drizzle-kit` (`src/db/schema-export.ts`) and `drizzle/` SQL.
- `react-email` templates and Better Auth / tRPC types consumed only for inference (`AppRouter`, `typeof auth`).
- Scheduled handlers invoked by Cloudflare cron, not by imports (`src/lib/scheduled-tasks.ts`).

#### How to tune (do this incrementally; get user approval before writing config)

1. `fallow doctor --format json --quiet`, then `fallow list --entry-points --format json --quiet` and `fallow list --plugins --format json --quiet` to see what was auto-detected. Add missing entry points via `entry` (e.g. `src/server.ts`, `src/start.tsx`, `src/lib/scheduled-tasks.ts`) only if absent.
2. Triage one issue type at a time (`--unused-files`, then `--unused-exports`, `--unused-types`, `--unused-deps`) with `--trace` / `--trace-file` to separate real findings from noise.
3. Fix real findings in small, separate commits.
4. Encode noise in a project config (`.fallowrc.json`, or `.fallowrc.jsonc`), preferring in order:
   - config: `ignorePatterns`, `entry`, `ignoreDependencies`, `ignoreExportsUsedInFile`, `usedClassMembers`, per-rule severity in `rules`;
   - inline `// fallow-ignore-next-line <issue-type> -- <reason>` for one-off cases. Always include a reason.
5. Start `rules` at `"warn"` for noisy categories (e.g. `unused-exports`, `unused-types`) and promote to `"error"` once clean. Consider `fallow audit --gate new-only` or a saved baseline (`--save-baseline`, committed outside `.fallow/`) so only newly introduced issues block work.
6. Configure `boundaries` (e.g. `components/ui` must not import from `routes`/`lib`; client code must not import server-only `src/lib/*` services / `cloudflare:workers`), or set `boundary-violation` to `off` to state it is not wanted.
7. Consider `--type-aware` (`fallow type-aware status`) to cut syntactic false positives before relying on it for deletions.
8. Update this section with the final config location and remove the "NOT YET TUNED" status.

Until tuning is done, use Fallow as a **signal**: prioritize findings in files you changed (`fallow audit --base main`), and ask the user before removing anything outside your diff.

## Git and safety

- Do not commit, push, or open PRs unless asked.
- **Always ask permission before creating a new branch or opening a new pull request.** Do this before starting work that would need one; do not create branches or PRs on your own initiative, even when asked to commit or push. Work on the current branch unless the user approves otherwise.
- **Do not co-author commits.** Never add `Co-authored-by:` trailers, "Generated with ..." lines, or any other agent/AI attribution to commit messages or PR descriptions. Commits are authored solely by the user's configured git identity.
- Never commit `.env`, `.env.*` (other than `.env.schema`, which **must** be committed), `.dev.vars*`, `.wrangler/`, `.cloudflare/`, `db-copy/`, `dist/`, or `.fallow/`.
- Do not edit generated files (`src/routeTree.gen.ts`, `varlock.d.ts`, `.cloudflare/types/**`, `drizzle/**`) by hand.
- Do not remove `src/server.ts`; it is the Worker entry and cron handler.
- Keep Stripe webhook signature verification and Turnstile verification intact when editing those flows; never log full payment payloads, card data, or session tokens.
- Scheduled tasks (cron triggers in `cloudflare.config.ts`): `*/30` iCal sync, `5 8 * * *` expired pending bookings cleanup, `15 9 * * *` iCal log cleanup. Changing the schedule requires updating both `cloudflare.config.ts` and `src/lib/scheduled-tasks.ts`.
