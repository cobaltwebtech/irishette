# Plan 04: dependency cleanup, Cloudflare Email Service, logo move + email logo

Status: **IMPLEMENTED 2026-11-11** on branch `chore/deps-cloudflare-email-logo` (5 commits, not pushed). Remaining: the manual steps listed by the user-side checklist (onboard the sending domain, delete `RESEND_API_KEY`, end-to-end check with `pnpm dev`).

Read `AGENTS.md` first. All its rules apply (secrets, `--local`, no remote/deploy without asking, generated files, Fallow, post-build workflow).

## Context

Five related chores on the Irishette repo, done on the branch `chore/deps-cloudflare-email-logo` (already created from `main`) in **separate commits per phase, no co-author / AI attribution lines** (user instruction; matches AGENTS.md).

Findings from exploration that shape the plan:

- **`@libsql/client` is unused** (only `package.json` mentions it). Every other dependency has at least one real import/config use (checked by hand and with Fallow). `@types/node` looks unused but `e2e/tsconfig.json` has `types: ["node"]`, so it stays. `resend` becomes unused in phase 4 and is removed there.
- **Fallow is working.** `fallow doctor` passes, `fallow dead-code` runs and traces correctly. It reports 0 unused deps because `fallow dead-code --trace-dependency @libsql/client` returns `is_used: true, peer_of: ["drizzle-orm"]`: Fallow treats a package that another installed package lists as a peer as "used". That is why Zed shows nothing, not a broken install. `.zed/settings.json` has no Fallow entry; the extension (`fallow-lsp` is on PATH) works without one. The user's uncommitted `.fallowrc.json` edit (`"unused-dependencies": "warn"`) is left untouched and unstaged.
- **Cloudflare Email Service** (Workers binding, docs confirmed via the Cloudflare MCP + `cloudflare-email-service` skill): `env.EMAIL.send({ from, to, subject, html, text, replyTo, headers })` returns `{ messageId }`, throws errors with a `.code` (`E_SENDER_NOT_VERIFIED`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`, ...). **No React rendering, no batch API, no idempotency key.** `cf` config has `bindings.sendEmail(...)`. Types (`SendEmail`, `EmailMessageBuilder`) are already in `.cloudflare/types/index.d.ts`; `pnpm types` adds `EMAIL` to `Env`. The skill says to always send both `html` and `text`.
- `react-email` v6 re-exports `render` (`export * from "@react-email/render"`), so templates render to HTML + plain text ourselves.
- Every send goes through `src/lib/email/email-service.ts` (`sendBatch` is the only Resend call site); tests mock `api.resend.com` with msw (`mockResend` in `test/workers/mocks.ts`, used by ~9 test files).
- Logo is referenced only by `src/components/Header.tsx:41` and `src/components/Footer.tsx:22`. Email templates have placeholder `<Img src="#">` in `AuthLinkEmail.tsx` and `BookingConfirmationEmail.tsx`. The PNG is 384x384, 235 KB.

User decisions:
- Sending domain: the user updates `src/lib/site.ts` with the new sending domains themselves (keep current values, restructure only).
- Duplicate protection: **D1 dedup table** (not just state guards).
- Admin alerts: **throttle per alert** in 1-hour windows (first emails immediately, repeats suppressed and counted).
- Local dev: **remote bindings (real sends)**.

## Branch

`chore/deps-cloudflare-email-logo` (created from `main`; carries the unstaged `.fallowrc.json` edit; every commit uses explicit paths so it is never included).

## Phase 1: Remove unused dependency (commit: `chore(deps): remove unused @libsql/client`)

- `pnpm remove -D @libsql/client` (updates `package.json`, `pnpm-lock.yaml`).
- Check `pnpm-workspace.yaml` (catalog/overrides/peerDependencyRules) per AGENTS.md; confirm `pnpm install --frozen-lockfile` passes.
- Verify Fallow: `fallow dead-code --unused-deps --format json --quiet` still 0, `fallow dead-code --trace-dependency @libsql/client` says not installed. Report the peer-dependency explanation above to the user; ask them to check Zed's log (`zed: open log`) if the extension still shows nothing, since the IDE is not visible from here.

## Phase 2: Move logo (commit: `chore(assets): move irishette-logo.png into public/icons`)

- `git mv public/irishette-logo.png public/icons/irishette-logo.png`.
- Update `src/components/Header.tsx` and `src/components/Footer.tsx` to `/icons/irishette-logo.png`.
- Re-grep the whole repo (src, docs, README, manifest, e2e) for `irishette-logo`; none expected beyond those two.

## Phase 3: Email dedupe + throttle table (commit: `feat(email): add sent_emails dedupe table`)

Replaces Resend's idempotency keys and adds the 1-hour alert throttle.

- New `src/db/email-schema.ts`, exported from `src/db/schema-export.ts`: table `sent_emails` with UUIDv7 `id` (`newId()`), unique `key`, `kind`, `sent_at` (UTC seconds timestamp), `suppressed_count` int default 0. Follow existing schema file conventions (e.g. `inbox-schema.ts`).
- `pnpm drizzle-kit generate`, review the SQL, `pnpm db:migrate:local`. **No remote migration** without user approval.
- New small helper in `src/lib/email/` (server zone; add to `.fallowrc.json` `server` zone list as AGENTS.md requires):
  - `claimEmail(db, key, kind)`: `insert ... onConflictDoNothing().returning({ id })`; no row returned = already sent.
  - `releaseEmail(db, key)`: delete the claim (called when the send fails so a retry can send).
  - Alerts: window = `floor(now/3600)*3600`, key `alert:<base>@<windowStart>` where base = `idempotencyKey ?? subject`. If the claim fails, `update ... set suppressed_count = suppressed_count + 1` and skip. When a claim succeeds, read the previous window's row and, if `suppressed_count > 0`, add a detail row ("Similar alerts suppressed in the previous hour: N") to that email. Limitation: a suppressed count is only reported if another alert for the same base fires in a later hour.
- Purge rows older than 7 days in the existing daily cleanup cron handler (`src/lib/server/scheduled-tasks.ts`; no schedule change, so `cloudflare.config.ts` triggers stay).
- Per-message keys (`<existingKey>#<index>`), not per batch, so a partial failure never re-sends the guest copy.

## Phase 4: Switch Resend to the `EMAIL` binding (commit: `refactor(email): send through Cloudflare Email Service`)

**Config / env**
- `cloudflare.config.ts`: add `EMAIL: bindings.sendEmail({ dev: { remote: true } })` (confirm the exact `dev` option shape in the `cf` types while implementing), remove `RESEND_API_KEY`. Update the header comment.
- `.env.schema`: remove `RESEND_API_KEY`; `pnpm env:types` regenerates `varlock.d.ts`; remove from `SECRET_NAMES` in `scripts/check-client-bundle.mjs`; remove from `vitest.config.ts` test bindings.
- `pnpm remove resend`; `pnpm types` to regenerate `Env` (adds `EMAIL: SendEmail`).
- The user does (list them at the end, do not run): delete `RESEND_API_KEY` from `.env.local` and the deployed Worker, onboard the sending domain(s) under Compute > Email Service > Email Sending (needs Cloudflare DNS), and update `src/lib/site.ts` with the new domains.

**`src/lib/email/email-service.ts`**
- Drop `Resend`/`CreateEmailOptions`. `EmailEnv` becomes `{ EMAIL: SendEmail; BETTER_AUTH_URL: string }`.
- Internal `OutgoingEmail = { from, to: string[], subject, element: ReactElement, replyTo?, key? }`; the existing builder helpers (`guestConfirmation`, `bookingNotice`, `adminBookingNotification`, `notification`) return that instead of Resend options (their React elements are unchanged).
- Replace `sendBatch` with a `deliver` function: `render(element)` for `html`, `render(element, { plainText: true })` for `text` (verify the option name), then `env.EMAIL.send(...)`. Messages go out sequentially or `allSettled`; the result is `{ success }` only if all sent; on error log `error.code` + message only (never addresses, same privacy rule as today) and release the dedupe claim. Keep the public `EmailResult` shape and all exported function names so callers (`auth.ts`, `bookings.ts`, services) change minimally. Functions that now need dedupe get `db` where they only have `env` (`sendBookingConfirmedEmails`, `sendPaymentFailedEmail`, `sendRefundEmails`, `sendCancellationEmails`; `sendAdminAlert` already has it). Auth emails, resend-confirmation and the contact form stay un-deduped (explicit user actions; they had no key).
- `src/lib/site.ts`: change `EMAIL_FROM_*` to `{ name, email }` objects (the binding's documented named-address form) and update the "Resend senders" comment. Values stay as they are. `contact.test.ts` asserts `from: EMAIL_FROM_ADMIN`, so it keeps working with the object.

**Tests** (`test/workers/`)
- Declare a `send_email` binding in `vitest.config.ts` miniflare options if supported; replace `mockResend` with `mockEmail()` in `mocks.ts` that stubs `env.EMAIL.send` (spy, or assign a fake) and returns the same `sent` recorder (`to`, `subject`, `replyTo`, `from`). Rename in `bookings`, `checkout`, `stripe-webhook`, `booking-integrity`, `ical-sync`, `scheduled`, `contact` tests; update the `network.ts` comment; the contact "email fails" test uses a rejecting stub instead of an msw 500.
- New tests: a duplicate key sends once and a failed send releases the claim; alert throttle (a second identical alert in the same hour is suppressed, and the count shows in the next window using `useClock`). The existing webhook replay test (`stripe-webhook.test.ts:186`, previously relying on the mock honoring `Idempotency-Key`) must still pass.

**Docs**: AGENTS.md (Email row, bindings, variables list, project overview), README.md, `docs/` notes that mention Resend (BOOKING_ARCHITECTURE, SECURE_AUTH_IMPLEMENTATION, TRPC_QUICK_REFERENCE, STRIPE_WEBHOOKS, CONTACT_FORM, STRIPE_PAYMENT_INTEGRATION), `e2e/contact.spec.ts` comment.

## Phase 5: Logo in email templates (commit: `feat(email): show the Irishette logo using the deployed hostname`)

- `src/lib/site.ts`: `LOGO_PATH = '/icons/irishette-logo.png'`.
- `email-service.ts`: compute `logoUrl = new URL(LOGO_PATH, env.BETTER_AUTH_URL).toString()` (`BETTER_AUTH_URL` is already the per-deploy base URL baked in at build time and used for every other email link, so production automatically uses the production domain) and `siteUrl` for the logo link; pass both as props to every template (templates stay prop-only because of the Fallow `email` zone).
- New shared `src/components/email/EmailLogo.tsx` (`<Link href={siteUrl}><Img src={logoUrl} width/height ... /></Link>`, explicit small display size such as 96 px since the file is 384 px) used in `AuthLinkEmail` (header and footer placeholders), `BookingConfirmationEmail` (header and footer), and added to the header of `NotificationEmail`, `BookingNoticeEmail`, `AdminBookingNotificationEmail` for consistency. Replace the `src="#"` / `href="#"` logo placeholders. The "social logo goes here" and nav-link `#` placeholders are out of scope and left as is.
- Note: in `pnpm dev` the logo URL points at `http://localhost:3000`, so it will not load in a real inbox when dev sends real mail; it resolves correctly on any deployed host.

## Verification (after each phase where relevant, all before finishing)

1. `pnpm check:fix`, then `pnpm check` (exit 0).
2. `pnpm typecheck`.
3. `pnpm test` (unit + workers); `pnpm build`, then `pnpm check:bundle`.
4. `pnpm env:scan` (env/secrets touched). `pnpm env:check` triggers Touch ID, so skip it unless the user wants it.
5. `pnpm install --frozen-lockfile`, and check `package.json` + `pnpm-workspace.yaml`.
6. Fallow: `fallow doctor`, `fallow audit --format json --quiet --base main`, `fallow architecture`; report the verdict and any findings introduced or judged false positives.
7. `git log` to confirm 5 commits with no `Co-authored-by` or "Generated with" lines; the `.fallowrc.json` edit is still unstaged.
8. Do not send real email or run remote migrations. After the user onboards the domain, a manual end-to-end check with `pnpm dev` (e.g. a magic-link sign-in to their own address) confirms delivery and the logo.
