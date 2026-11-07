# AGENTS.md

Guidance for AI coding agents working in this repository. Read this first, then load the relevant skill (see [Skills](#skills)) before touching that area.

## Project overview

Irishette is a room-booking site (rooms, availability, bookings, payments, admin, iCal sync) deployed as a single Cloudflare Worker.

| Concern | Choice |
|---|---|
| Package manager | **pnpm** (never npm/yarn; never commit `package-lock.json`/`yarn.lock`) |
| Framework | TanStack Start (React 19, Vite 8, React Compiler via `babel-plugin-react-compiler`) |
| Routing / data | TanStack Router (file-based), TanStack Query, TanStack Table, TanStack Store |
| API | tRPC v11 (`src/integrations/trpc/`) served through TanStack Start server routes in `src/routes/api/` |
| Auth | Better Auth + `@better-auth/stripe` + Drizzle adapter (`src/lib/auth.ts`) |
| Payments | Stripe (`src/lib/payment-service.ts`, webhooks in `src/routes/api/stripe.$.ts`) |
| Database | Cloudflare D1 (binding `DB`) via Drizzle ORM (SQLite dialect) |
| Other bindings | KV `KV_ICAL_SYNC_LOG`; cron triggers (see `wrangler.jsonc`) |
| Email | Resend + react-email templates in `src/components/email/` |
| Bot protection | Cloudflare Turnstile |
| UI | Tailwind CSS v4, shadcn/ui (new-york, Stone) + Radix, `sonner` toasts |
| Validation | Zod v4 |
| Lint / format | **Biome** 2.x |
| Code review / dead code | **Fallow** (global CLI) |

Path alias: `@/*` -> `src/*`. TypeScript is `strict` with `noUnusedLocals` / `noUnusedParameters`.

## Commands

Always run project tools through `pnpm` (Biome, Wrangler, drizzle-kit, tsc are **not** on the global PATH).

```bash
pnpm install                 # install deps
pnpm dev                     # Vite dev server on :3000 (Cloudflare Vite plugin, local D1/KV)
pnpm build                   # vite build
pnpm dev:cf                  # build, then `wrangler dev` (closest to production)
pnpm serve                   # vite preview
pnpm deploy:cf               # build + wrangler deploy  (ASK THE USER FIRST)
pnpm clean                   # removes dist, .tanstack, src/routeTree.gen.ts

pnpm biome check --write     # lint + format + organize imports (preferred before finishing)
pnpm lint                    # biome lint (read-only)
pnpm format                  # biome format --write
pnpm tsc --noEmit            # type check (no script exists; Vite does not type check)
pnpm vitest run              # tests (Vitest is installed; there are currently no test files)
```

Notes:
- `README.md` mentions ESLint/Prettier/`pnpm check`/`pnpm start`; that is stale. Biome is the only linter/formatter.
- `src/routeTree.gen.ts` and `worker-configuration.d.ts` are generated. Never hand-edit them; Biome ignores them.
- `docs/CLAUDE.md` is an older, partially stale overview. Prefer this file when they conflict.

## Code style (Biome)

Config is `biome.json`. It formats and lints only `src/**` (plus `.vscode/*`).

- **Tabs** for indentation, **single quotes** for JS/TS.
- `recommended` lint rules; organize-imports is on (run `pnpm biome check --write` to fix import order).
- Do not add ESLint, Prettier, or their config files.
- Do not reformat unrelated files; keep diffs focused. Run Biome only on files you changed when practical: `pnpm biome check --write <paths>`.
- Biome upgrade path is `pnpm up:biome` (updates and runs `biome migrate --write`).
- Use `import type` for type-only imports and the `@/` alias for cross-directory imports.

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
drizzle/                 Generated SQL migrations (applied via Wrangler)
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
  4. Apply locally: `pnpm wrangler d1 migrations apply DB --local`.
  5. Remote (`--remote`) only with explicit user approval.
- Better Auth tables live in `src/db/auth-schema.ts`; keep them in sync with Better Auth plugin changes.
- Local D1 state lives in `.wrangler/` (gitignored). Inspect local data with Wrangler or the Local Explorer (see `workers-development` skill).
- `wrangler.jsonc` currently binds `irishette-dev`. Treat any `--remote` command as touching real data.

## Secrets and environment

- Local secrets are in `.env` (gitignored). **Never print, log, commit, or paste its values.** Reading key names is fine.
- Server: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_BETTER_AUTH_WEBHOOK_SECRET`, `STRIPE_TRPC_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`.
- Client (build-time, `VITE_` prefix only, must be non-sensitive): `VITE_TURNSTILE_PUBLIC_KEY`.
- Production secrets: `pnpm wrangler secret put <NAME>`. Do not put secrets in `wrangler.jsonc`.
- After changing bindings or vars in `wrangler.jsonc`, regenerate types: `pnpm wrangler types`.

## CLI tools

| Tool | How to run | Use for |
|---|---|---|
| Wrangler | `pnpm wrangler ...` | Local dev, D1 migrations, KV, secrets, deploy, tail logs, `wrangler types` |
| `cf` (Cloudflare CLI, beta) | `cf ...` (global) | Cloudflare API/resource commands, `cf cli search`, `cf schema`. Project has a `wrangler.jsonc`, so Wrangler is the default for project commands. |
| Stripe CLI | `stripe ...` (global, `/opt/homebrew/bin/stripe`) | `stripe listen --forward-to localhost:3000/api/...` for webhooks, `stripe trigger`, test-mode inspection |
| Biome | `pnpm biome ...` | Lint/format |
| Fallow | `fallow ...` (global) | Dead code, duplication, architecture, audit/review (see below) |
| drizzle-kit | `pnpm drizzle-kit ...` | Migration generation |
| shadcn | `pnpm dlx shadcn@latest add <component>` | Add UI components (also available via the `shadcn` MCP in `.mcp.json`) |

Rules:
- Stripe: use **test mode** only. Never run live-mode or destructive Stripe commands without explicit approval.
- Cloudflare: prefer local (`--local`) operations. Ask before `--remote`, `deploy`, `secret put/delete`, `d1 delete`, or anything that changes live resources.
- For Cloudflare docs, use the `cloudflare-docs` MCP (`opencode.jsonc`) or the skills below instead of relying on memory; Workers APIs change.

## Skills

Skills are installed in **`.agents/skills/`** (locked in `skills-lock.json`; `.claude/skills/` symlinks to the same directories). Read the relevant `SKILL.md` before starting work in its area.

| Area | Skill (`.agents/skills/<name>/SKILL.md`) |
|---|---|
| Writing/reviewing Worker code | `workers-best-practices` |
| Running/debugging locally, logs, Local Explorer | `workers-development` |
| CPU/memory profiling of the deployed Worker | `workers-profiling` |
| Wrangler commands and config | `wrangler` |
| Cloudflare `cf` CLI, choosing cf vs Wrangler | `cf-cli` |
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

Also see `.claude/agents/` for `shadcn-ui-builder` and `tanstack-server-functions` agent prompts (TanStack server function conventions: Zod `inputValidator`, `z.infer` types, composed middleware).

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

1. `pnpm biome check --write <changed paths>`
2. `pnpm tsc --noEmit`
3. `pnpm build`
4. **Fallow review** (below)

Do not claim a task is done until these pass, or state clearly which step failed and why.

## Fallow (code review after building)

Fallow is installed **globally** (`fallow`). Load the `fallow` and `fallow-review` skills for the full rules. Fallow does not replace Biome (style) or `tsc` (types); it covers dead code, duplication, circular dependencies, complexity, and architecture.

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
- The `cloudflare:workers` virtual module and Worker `Env` types from `worker-configuration.d.ts`.
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
- Never commit `.env`, `.wrangler/`, `db-copy/`, `dist/`, or `.fallow/`.
- Do not edit generated files (`src/routeTree.gen.ts`, `worker-configuration.d.ts`, `drizzle/**`) by hand.
- Do not remove `src/server.ts`; it is the Worker entry and cron handler.
- Keep Stripe webhook signature verification and Turnstile verification intact when editing those flows; never log full payment payloads, card data, or session tokens.
- Scheduled tasks (`wrangler.jsonc` cron triggers): `*/30` iCal sync, `5 8 * * *` expired pending bookings cleanup, `15 9 * * *` iCal log cleanup. Changing the schedule requires updating both `wrangler.jsonc` and `src/lib/scheduled-tasks.ts`.
