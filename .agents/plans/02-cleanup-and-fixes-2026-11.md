# Irishette Cleanup and Fixes Plan (2026-11, plan 02)

Status: **APPROVED** (decisions agreed 2026-11-07, clarifications added the same day). Items marked **Proposed** are the author's default for a detail the user has not decided. Follow them unless the user says otherwise, and mention them in the phase report. Run one phase per session.

Context: this plan follows `01-upgrade-2026-11.md`, which finished at commit `1ea0440` "chore: cleanup and docs" on branch `updates`. The findings come from the plan 01 Phase 8 docs review (four agents rewrote the booking, tRPC, auth and Stripe docs against the code) and from a review on 2026-11-07 of:
- the cancellation window
- Stripe Checkout Sessions
- the route guards

Re-verify anything marked **VERIFY** against installed source or current docs before relying on it.

Read `AGENTS.md` first. All its rules apply (secrets, `--local`, no remote/deploy without asking, generated files, Fallow, post-build workflow).

---

## 0. Ground rules

- **Branch:** `chore/cleanup-2026-11`, created from `updates` in Phase 0 (approved). Do not push or open a PR without asking.
- **Execution order:** 0, 1, 2, **4, then 3**, 5, 6, 7. Phase 4 (contact form + admin notification inbox) runs before Phase 3 (payments), because the dispute notifications in 3.4b need the inbox. Section numbers are unchanged.
- **Commits:**
  - one commit per phase
  - Phase 3 (the largest) may commit in two gated parts: 3.1–3.4 (Checkout Sessions, webhooks, refund emails), then 3.5–3.9 (cancellation, statuses, booking fixes, check-in times). Implement 3.9 (the normalized `check_in_at` / `check_out_at`) first within that part, because 3.5 and 3.6 depend on it.
  - Phase 5 (Base UI): one commit per component, as the shadcn migration skill makes them
  - no co-author or agent attribution
- **End-of-phase gate.** A phase is not done while a step fails; report any failing step clearly.
  1. `pnpm check:fix`, then `pnpm check` (exit 0, no new warnings)
  2. `pnpm typecheck`
  3. `pnpm build`, then `pnpm check:bundle`
  4. `pnpm test`
  5. `pnpm test:smoke` against `pnpm dev` (tell the user: Touch ID prompt)
  6. `pnpm test:e2e` for phases that change auth, booking or payment UI. Signed-in and Stripe tests need the `E2E_*` vars; if they are missing, skip those tests and say so.
  7. `fallow audit --format json --quiet --base HEAD` before committing (isolates the phase) and `--base updates` for the branch. Report the verdict and anything introduced.
  8. If the schema changed: `pnpm db:check` and `pnpm db:reset:local`
  9. If env/secrets changed: `pnpm env:scan`
- **Tests first:** for each bug, add a failing test (Vitest unit/workers, or e2e for UI-only behaviour) before the fix where practical. Add new tRPC procedures to `test/workers/trpc-authz.test.ts`, and to `trpc-public-leaks.test.ts` if public.
- **Docs:** update the matching `docs/*.md` in the same phase.
- **Remote/live: ask first.** No remote D1, deploys, secret changes or live-mode Stripe. Stripe sandbox only.
- **Skills to use:**
  - `stripe-best-practices` + `stripe-docs` (Phase 3)
  - `turnstile-spin` (Phase 4)
  - `workers-best-practices`
  - TanStack skills in `node_modules`: `router-core/auth-and-guards`, `start-core/middleware`, `start-core/server-functions`
  - tRPC skills: `error-handling`, `validators`, `middlewares`
  - `fallow` / `fallow-review`
  - the shadcn migration skill (Phase 5)

---

## 1. Decisions record

| Topic | Decision |
|---|---|
| Migrations | **Stay on the single baseline** `drizzle/0000_init.sql`. Schema changes edit `src/db/*`, then delete and regenerate `drizzle/` with `pnpm db:generate`, then `pnpm db:reset:local`. Remote gets one migration at production go-live (not in this plan). |
| UI library | **Migrate shadcn/ui from Radix to Base UI** with the official shadcn migration skill, one component at a time. **Keep the current look of every component** (carry over all local style tweaks). |
| Toasts | Use whatever shadcn's Base UI setup ships by default (currently the shadcn **Toast** on Base UI: `@/components/ui/toast`, `toast.add(...)`), replacing `sonner`. Restyle it to match the current toasts. |
| Room pages | **Keep two room pages** (`rose-room.tsx`, `texas-room.tsx`) and share their layout and sections as components. Remove the hardcoded slugs from the booking flow. |
| Legal pages | **Stay hardcoded** as they are (a small CMS may come later). No content refactor. |
| Payments | **Migrate to Stripe Checkout Sessions with `ui_mode: 'elements'`.** On the client, use `CheckoutElementsProvider` / `useCheckoutElements` / `PaymentElement` from `@stripe/react-stripe-js/checkout`, and confirm with `checkout.confirm()`. Refunds still go through the session's PaymentIntent. `bookings.stripeSessionId` becomes the real session link. |
| Booking priority | **First hold wins while it is live.** A live pending hold blocks other holds on the same dates. Refreshing it during payment extends it. Once it expires, another guest may hold the dates, and the expired hold's Checkout Session is expired at that moment so it can't be paid. Nobody pays and then gets refunded. |
| Dashboard refunds | Handle `refund.created`, `refund.updated` and `refund.failed`, plus `charge.refunded` for totals. A **full** refund cancels the booking (`cancelledBy: 'system'`) and frees its dates. A **partial** refund updates the amounts. **Email the guest and the admins** with the full refund details from the webhook and the full booking details, like the confirmation email, and create a `refund_issued` inbox item (see 3.00, 3.4). |
| Cancellation refunds | Percent of the **booking total including taxes and fees** (current behaviour). For a booking already partly refunded, the refund is the policy percent of the **original total**, capped at what is still paid (`totalAmount - refundAmount`). |
| Check-in / check-out time | **Check-in is 4:00 PM (16:00) America/Chicago** for all logic: cancellation windows, the "can cancel" cutoff, `stayPhase` and the times shown in the UI and emails. It is a single constant, no longer a per-policy setting (see 3.9). **Check-out is 11:00 AM (11:00) America/Chicago** (confirmed), also a constant. |
| Cancellation windows | Windows count back from **check-in at 4:00 PM (16:00) America/Chicago** on the check-in date. Default policy: **100% refund if cancelled at or before 4:00 PM CT three days before check-in ("72 hours"), 50% until 4:00 PM CT the day before ("24 hours"), 0% after that.** From 4:00 PM CT on the check-in date, guests can't cancel online. At exactly a cutoff, the **higher** refund applies. |
| Time zone and DST | **All date/time rules use America/Chicago wall-clock time, always.** This includes cancellation cutoffs, check-in/out, the same-day cutoff, "today" and stay phase, whatever the server's or user's time zone. Tier cutoffs are wall-clock: "72 hours before" is 4:00 PM CT three calendar days earlier, so across a DST change the cutoff stays at 4:00 PM local (that day has 71 or 73 elapsed hours). The API converts each local cutoff to a UTC instant for that date with the Chicago offset in effect then, using `zonedTimeToUtc`. |
| Timestamp normalization | Every instant in D1 is **UTC Unix seconds** (`integer(..., { mode: 'timestamp' })`, as today). Stay dates stay property-local `YYYY-MM-DD`. Each booking also stores its **normalized check-in and check-out instants** (`check_in_at` = check-in date at 16:00 CT, `check_out_at` = check-out date at 11:00 CT, both in UTC). Cancellation, refund and stay-phase checks compare UTC instants from the database instead of rebuilding local times (see 3.9). |
| Stripe ↔ booking link | Every Stripe object the app creates carries **our booking ids in metadata**, so any event can be traced back to the booking: Checkout Session (`client_reference_id` = booking `id`; `metadata`), PaymentIntent (`payment_intent_data.metadata`, plus a `description` with the confirmation id), refunds (`metadata`). Metadata keys: `bookingId` (UUIDv7 primary key), `bookingPublicId`, `confirmationId`, `source: 'irishette'`. **No guest personal data in metadata.** Webhook handlers look up the booking by `metadata.bookingId` first, then by stored Stripe ids. |
| Disputes | Handle Stripe disputes (`charge.dispute.*`). **No email from the app** (Stripe already emails the account owner). Show an **in-app notification in the admin inbox** that turns unread again on every new Stripe event for the dispute (3.00). Store every dispute detail from the webhook, linked to the booking and the guest's user profile, and show it on the admin booking page and guest page (see 3.4b, 4). |
| Webhook events doc | At the start of Phase 3, write the required Stripe events for the Checkout Sessions flow in their own section of `docs/STRIPE_WEBHOOKS.md`, before writing the handlers, so the dashboard and CLI can be set up. Update that doc again when Phase 3 is done (see 3.0). |
| Same-day bookings | Check-in **today** (property date) is allowed only **until 9:00 AM (09:00) America/Chicago**. After that, the earliest check-in is tomorrow. Enforced on the server and shown in the calendar (see 3.9). |
| Saved cards | **Don't save cards.** Remove `setup_future_usage`, and leave Checkout's `saved_payment_method_options.payment_method_save` at `disabled` (set it explicitly). Refunds still go back to the card used. Guests can still use **Stripe Link** inside the Payment Element; Link stores their details in their own Link account, handled entirely by Stripe. |
| Security headers | Start the CSP in **report-only** mode; enforce it after testing (see 1.5). |
| Site constants | Domain, sender addresses, contact email and phone are **hardcoded in one module**, `src/lib/site.ts` (no env bindings). They must be changed to the production domain before go-live (checklist in "After the plan"). The public phone number is a placeholder until the client provides it. |
| shadcn skills | Install the latest shadcn skills from the shadcn docs (`pnpm dlx skills add shadcn/ui`) in Phase 0 (approved), and use them for Phase 5. |
| Booking status | Stored statuses are **`pending`, `confirmed`, `cancelled`** only. Remove `completed` everywhere. Proposed additions in 3.6 (derived `stayPhase`, payment statuses). |
| `discountAmount` | Keep the column, unused, for future discounts. Checkout Sessions discounts can feed it later. |
| Phone auth | **Remove the Better Auth `phoneNumber` plugin.** Keep the phone number as a plain, optional, unique profile field (`additionalFields`), and drop `phone_number_verified`. |
| Primary sign-in | **Magic link first** on login and signup. Email + password stays as an option, along with password reset. |
| Route guards | Add `src/lib/auth-check.ts` (`requireAuth`, `requireAdmin`, `optionalAuth`, `requireNoSession`), adapted from the user's airwartrail template to this app's per-request QueryClient and `getSessionFn`. Pathless layouts call it in `beforeLoad`. Add TanStack Start function middleware for protected server functions (see 2.4). |
| Contact form | **Revised 2026-11-08 (see 4.0):** a public TanStack Start server function with Zod + server-side Turnstile that emails the admin (`CONTACT_EMAIL`, guest as reply-to) **and stores the message as an admin notification with a `mailto:` Reply button** (update during Phase 4). Optional booking confirmation ID field. Dashboard replies and inbound email are deferred (`deferred-email-messaging.md`). |
| Admin inbox | **Revised 2026-11-08 (see 4.0):** an **internal notification inbox** for Stripe and system events only (disputes, refund problems, calendar sync problems, double bookings), tagged by `source`. An admin route with a **server-paginated TanStack Table** and an efficient list query. Read/unread + archive with a cached unread badge (5-minute poll), links to the booking and guest pages, per-booking and per-guest panels. Admins can **delete** items; items are **kept until deleted**. No guest messages (deferred). |
| Branch | `chore/cleanup-2026-11` from `updates`. |

---

## 2. Current state (2026-11-07, commit `1ea0440`)

- **Gate:** green.
  - `pnpm check`: 0 errors, 19 warnings (15 `react/purity`, 3 `react/set-state-in-effect`, 1 in `ui/sidebar.tsx`)
  - typecheck, build and bundle check pass
  - 293 tests and smoke 10/10 pass
  - `fallow dead-code`: 0 issues
- **`fallow audit --base main`** fails on inherited complexity (95 findings) and duplication (87 clone groups, about 15% of lines).
- **Duplication hotspots (lines):**
  - room pages: 363
  - admin vs account booking detail: 213
  - login vs signup: 202
  - legal pages: about 520 (left as is per decision)
  - admin current vs past bookings: 126
  - account index vs past bookings: 110
  - `MagicLinkEmail` vs `PasswordReset`: 111
- **Complexity targets:** `BookingDetailsStep.tsx` (cognitive 36, 581 lines), `parseIcal` (30), `SignupPage` (30).
- **Payments today:** raw PaymentIntents (`preparePayment` in `src/lib/booking-service.ts`), `<Elements>` + `PaymentElement` in `PaymentStep.tsx`, `confirmPayment` with `redirect: 'if_required'` and no `return_url`. The webhook handles `payment_intent.succeeded`, `charge.refunded` and `refund.failed`/`refund.updated`. `stripeSessionId` and `discountAmount` are never written.
- **Guards today:**
  - `__root.tsx` preloads the session (`ensureQueryData(sessionQueryOptions())`) into the per-request QueryClient.
  - `_authed.tsx` redirects anonymous users.
  - `_authed/_admin.tsx` re-fetches with `freshSessionQueryOptions`.
  - Auth pages use `redirectIfSignedIn` (`src/lib/redirect.ts`).
  - The only server function is `getSessionFn` (public). Every API surface enforces its own auth: tRPC procedures, Better Auth, the Stripe signature, the iCal token.
- **Cancellation window today** (correct; see 3.5 for the gaps):
  - Each booking stores its policy version (`cancellationPolicyId`).
  - `quoteCancellation` counts hours from the policy's `checkInTime` (default `'16:00'`) in the policy's `timezone`. Both are editable per policy on the admin page (`cancellation_policies.check_in_time` / `timezone`). Tiers apply at `>= minHoursBefore`.
  - Guests can't cancel after check-in time. Admins can, with full, policy or no refund.
  - Unit tests cover the 72/71.9/24/23.9 h boundaries; workers tests cover the guest, admin and hold cases.
- **Times in the UI:** the 11:00 AM check-out is hardcoded text in the booking pages, the confirmation page, `contact.tsx` and `BookingConfirmationEmail`.
- **Hardcoded domains** (to move into `src/lib/site.ts`):
  - `email-service.ts` senders (`*@contact.cobaltweb.tech`, with "Irishette Dev" on bookings)
  - `info@irishette.com` in the contact page, the auth and booking emails, and the legal pages
  - `https://irishette.com` in `BookingConfirmationEmail`, the `ical-sync.ts` user agent and `RoomDetails.tsx`
  - the workers.dev URL in `docs/STRIPE_WEBHOOKS.md`
- **Contact:** `src/routes/contact.tsx` only `console.log`s.
- **Verified against installed packages (2026-11-07):**
  - Stripe Checkout Sessions accept `ui_mode: 'elements'`, `expires_at` between 30 minutes and 24 hours after creation, and `integration_identifier` (stripe 23.1.0 types).
  - `@stripe/react-stripe-js` 7.0.1 exports `CheckoutElementsProvider`, `useCheckoutElements` and `PaymentElement` from `@stripe/react-stripe-js/checkout`.
  - Better Auth 1.7.18 supports `rateLimit.storage: 'database' | 'secondary-storage' | 'memory'`, and its magic-link sign-in body accepts an optional `name`.
  - TanStack Start 1.170 provides `createStart(() => ({ requestMiddleware, functionMiddleware }))` and `createMiddleware`.

---

## Phase 0: Branch, baseline, skills and site constants

1. `git status` must be clean. Then run `git switch -c chore/cleanup-2026-11` (from `updates`).
2. Run the full gate once and record the numbers in the session report.
3. Run `pnpm outdated` and note what's available. Upgrade only what a later phase needs: `@stripe/react-stripe-js` / `@stripe/stripe-js` if a newer Checkout Elements SDK is out, and `@base-ui/react` in Phase 5.
4. **shadcn skills (approved):**
   - Run `pnpm dlx skills add shadcn/ui` (the command from ui.shadcn.com/docs/skills). It installs the latest shadcn skills, including the Radix → Base UI migration guidance.
   - Check that they land in `.agents/skills/` (with the `.claude/skills/` symlinks) and in `skills-lock.json`, like the existing skills.
   - Add a row for them to the AGENTS.md skills table.
   - Read the skill and note how it runs `shadcn info --json` and how it migrates.
5. **Site constants (`src/lib/site.ts`, shared zone):**
   - `SITE_URL`, `SITE_NAME`
   - `CONTACT_EMAIL`, `CONTACT_PHONE` (placeholder until the client provides it)
   - `EMAIL_FROM_BOOKINGS`, `EMAIL_FROM_ADMIN`, `EMAIL_FROM_AUTH`, `EMAIL_REPLY_TO`
   - `PROPERTY_TIMEZONE` (re-exported from `timezone.ts`), `CHECK_IN_TIME = '16:00'`, `CHECK_OUT_TIME = '11:00'`, `SAME_DAY_CUTOFF_TIME = '09:00'`
   - display helpers ("4:00 PM CT", "11:00 AM")

   Replace the hardcoded values in code: `email-service.ts`, the email templates, `contact.tsx`, `ical-sync.ts` and `RoomDetails.tsx`. Legal pages stay untouched (decision). No change in behaviour; values stay the same. Add a comment saying that the domain and senders change at go-live.
6. Commit: "chore: shadcn skills and site constants".

---

## Phase 1: Data exposure and authorization

Each item gets a workers test that fails first.

### 1.1 Guest-facing booking responses

`bookings.getBooking`, `getMyBookings` and the confirmation loader (`bookingDetails`, `findAccessibleBooking` in `src/integrations/trpc/bookings.ts`) return the full `bookings` row and the full `payment_transactions` row to the owner. That includes `internalNotes` (admin-only) and the Stripe customer, session, intent and refund ids.
- Add explicit column sets or mappers, `guestBookingColumns` and `guestPaymentColumns`. Admin procedures keep the full rows.
- Add a test: guest responses contain no `internalNotes`, `stripe*` ids, `userId` or primary `id`. **VERIFY** which fields the account and confirmation UIs read before dropping any.

### 1.2 Admin role freshness

- **Proposed:** `adminProcedure` (`src/integrations/trpc/init.ts`) re-reads `role` and `banned` from D1 for `ctx.user.id` (one indexed query) and throws `FORBIDDEN` unless the user is an unbanned admin. `protectedProcedure` rejects banned users the same way. This closes the up-to-5-minute window from Better Auth's cookie cache.
- The admin layout's fresh read shares the query key with the cached session, so on SSR it is usually skipped. Fix this in 2.4 (`requireAdmin`).

### 1.3 Procedure fixes

- **`users.adminGetGuestDetails`:** select explicit columns instead of the whole `user` row (which includes the ban fields).
- **Errors:** custom messages on `INTERNAL_SERVER_ERROR` are replaced by `errorFormatter`, and `users.ts` logs errors itself, so they are logged twice. Use proper codes and let `errorFormatter`/`onError` log. Affects `adminGetGuestDetails`, `updatePhoneNumber` (replaced in 2.1) and `resendConfirmationEmail`.
- **Validation:**
  - `bookings.adminListBookings`: use `isoDateSchema` and the id schemas, and allow either date bound alone.
  - `ical.getSyncLogs`: use proper id schemas.
- **Public room lookups:** `rooms.list` (by default) and `rooms.get` return inactive and archived rooms. Public callers should get `active` rooms only. **VERIFY** that the admin UI uses admin procedures.
- **`ical.testUrl`:** allow `https:` only, reject IP literals and `localhost`, keep the timeout, and cap the response size (reuse the `ical-sync.ts` limits).
- **`ical.syncFeed`:** no caller and no test. **Proposed:** remove it (`syncRoomFeeds` covers "Sync now").
- **Tests:** add `bookings.calculateBooking` to `trpc-public-leaks.test.ts`.
- **Router context:** remove the unused `trpcClient` (`src/router.tsx`).

### 1.4 Auth rate limiting

Better Auth's rate limits are in memory, which on Workers means per isolate. Use `rateLimit.storage: 'database'` (confirmed in 1.7.18) with `customRules` for sign-in, magic link, sign-up, password reset and send-verification.
- Generate the table's Drizzle definition from Better Auth's `rateLimitSchema` (use `pnpm dlx @better-auth/cli generate` against a temporary output, or copy the fields from `@better-auth/core` `db/schema/rate-limit`). Add it to `src/db/auth-schema.ts` and regenerate the baseline.
- Rows are keyed by IP and path. **Proposed:** add the rate-limit table cleanup to the daily `15 9 * * *` cron (delete rows older than a day), unless Better Auth already cleans it up (**VERIFY**).

### 1.5 Security headers (Proposed)

Add a TanStack Start global request middleware (`createStart(() => ({ requestMiddleware: [securityHeaders] }))` in `src/start.tsx`; see the `start-core/middleware` skill) that sets:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` (or `frame-ancestors 'none'`)
- a CSP that allows Stripe (js.stripe.com, the Stripe and Link frames and APIs, per Stripe's CSP guide) and Turnstile (challenges.cloudflare.com), sent as `Content-Security-Policy-Report-Only` (decision)

Skip it for `/api/ical/*` and `/api/stripe/*` if the headers get in the way. Violations show in the browser console. **Proposed:** also add a small `report-to`/`report-uri` endpoint that logs violation summaries without user data, so testing shows what would break. Enforce the CSP only after the user has tested the booking, payment (including Link), auth and admin flows. That switch is a separate, later change; note it under "After the plan".

### 1.6 Phase 1 decisions (2026-11-08, after the Phase 0 review; these override 1.1–1.5 where they differ)

- **Admin check (1.2):** `adminProcedure` reads `role` and `banned` from D1 for `ctx.user.id` on every admin call (one lookup by primary key) and throws `FORBIDDEN` unless the user is an unbanned admin. `protectedProcedure` rejects banned users using the session's `banned` field (no extra query).
- **Admin guard in the browser (overrides 2.4's fresh-key idea):** the admin layout uses the cached session with `staleTime` 30 minutes instead of re-reading a fresh session about every 5 s. When a tRPC call returns `FORBIDDEN`/`UNAUTHORIZED`, the client refreshes the session (`refreshSession`) and redirects. The server check above is the real enforcement.
- **Guest booking responses (1.1, verified):**
  - `getBooking`/`getMyBookings` return guest columns only, without `paymentDetails` (unused everywhere) or the internal `id`.
  - The admin booking page moves to a new `bookings.adminGetBooking` (adminProcedure: full row plus user).
  - `resendConfirmationEmail` takes `publicId` instead of the internal id.
  - The internal id that `createBooking` returns to the payment flow is handled in Phase 3.
- **Rooms (1.3, verified):** the admin sidebar, the property list and the room editor use the public `rooms.list`/`rooms.get` and need every status. Add `rooms.adminList`/`rooms.adminGet` (admin), switch those callers to them, then make the public `list`/`get` return active rooms only.
- **`ical.syncFeed` (1.3):** remove the tRPC procedure (no callers). Keep `syncFeed()` in `ical-sync.ts` (`syncRoomFeeds` uses it) and add the path to the `REMOVED` list in `trpc-authz.test.ts`.
- **Rate limiting (1.4):**
  - Better Auth `rateLimit.storage: 'database'` with `customRules`. Strict and atomic in D1. It deletes its own expired rows, so no cron is needed (B1 answered).
  - The table is `rateLimit` (`key` unique, `count`, `lastRequest` bigint epoch ms; `@better-auth/core` `get-tables`). Add it to `auth-schema.ts` and regenerate the baseline.
  - Also add a Cloudflare Rate Limiting binding middleware (`bindings.rateLimit({ namespace, simple: { limit, period: 10 | 60 } })` in `cloudflare.config.ts`). It covers `/api/auth/*`, public or expensive tRPC mutations (`bookings.calculateBooking`, admin `ical.testUrl`) and, in Phase 4, the contact server function (`contact.submit` scope) and `/api/csp-report`. Key by IP when signed out and by user id when signed in. Return 429 with `Retry-After`.
  - Every 429 (middleware or Better Auth) logs one structured JSON line to Workers Logs (`message: 'rate-limited'`, limiter, path, a hashed IP; never the raw IP).
  - **No KV:** 1 write per key per second, eventually consistent, no atomic increment. No Analytics Engine for now.
  - Declare the binding in `vitest.config.ts` too, with test values.
- **CSP reports (1.5, B6):** `/api/csp-report` accepts `application/csp-report` and `application/reports+json`. It logs a cleaned, structured `console.warn` (`message: 'csp-violation'`, directive, blocked origin, document path with no query string, disposition) to Workers Logs, is rate-limited, and stores nothing. Send both `report-uri` and `report-to`/`Reporting-Endpoints`. Query the reports in the Observability Query Builder.

**Docs:** `TRPC_QUICK_REFERENCE.md`, `SECURE_AUTH_IMPLEMENTATION.md`.
**Gate, then commit:** "fix: guest data exposure, fresh admin checks, procedure validation".

---

## Phase 2: Auth (guards, phone plugin removal, magic link first, form fixes)

### 2.1 Remove the phoneNumber plugin

- Remove `phoneNumber()` (server, `src/lib/auth.ts`) and `phoneNumberClient()` (`src/lib/auth-client.ts`).
- Add `phoneNumber` to `user.additionalFields` (optional; **VERIFY** whether `input: true` is safe or whether updates should go only through tRPC). Keep the unique index. Drop `phone_number_verified` from `auth-schema.ts` and regenerate the baseline.
- Combine `users.updatePhoneNumber` and `users.updateProfile` into one profile update path:
  - trim, max 20 characters, one shared phone schema (also used by the booking form)
  - a duplicate phone returns `CONFLICT`

  Update the callers: `BookingDetailsStep.tsx`, `EditProfileModal.tsx`, `account/index.tsx`, `admin/guest/*`, `auth-server.ts` (`SessionUser.phoneNumber` stays).
- Tests:
  - `/api/auth/sign-in/phone-number` returns 404
  - a duplicate phone returns `CONFLICT`
  - a profile update round-trips

### 2.2 Magic link first

- Login and signup open on the magic-link view, with "Use a password instead" as an option. Keep Turnstile on every auth endpoint.
- Magic-link sign-up collects a name and an email and passes `name` to `authClient.signIn.magicLink({ email, name, callbackURL })`. `signup.tsx` doesn't send the name today. The body accepts an optional `name` (1.7.18), which is used when the link creates a new user. Keep `disableSignUp` false.
- Shared components:
  - auth form shell
  - Turnstile widget with `reset()`
  - error mapping
  - "check your email" panel

  These also remove most of the login/signup duplication.
- Update the e2e auth tests.

### 2.3 Auth form correctness

- The Better Auth client returns `{ data, error }`, so check `error` in the magic link, `requestPasswordReset`, `resetPassword` and password-login forms. Reset Turnstile after every failure.
- **Link lifetimes (Proposed):** `magicLink({ expiresIn: 15 * 60 })` (option confirmed), with reset and verification at 1 hour set explicitly. The pages read these values from `src/lib/site.ts` (or an `auth-constants.ts` next to it).
- `registerSchema` uses `passwordSchema` (upper case, lower case, digit).
- "Resend verification email" for unverified password users, Turnstile-protected (**VERIFY** the captcha endpoint path).
- `reset-password.tsx`: `validateSearch` with Zod.

### 2.4 Route guards and middleware (`src/lib/auth-check.ts`)

The user's template (`airwartrail-cms/src/lib/auth-check.ts`) is adapted, not copied, because two parts of it are unsafe here:
- It uses a **module-level `queryClient`**. On Workers that cache would be shared between requests and users during SSR (a data leak). Use `context.queryClient` from the router context, which is created per request in `src/router.tsx`.
- It uses **`fetch('/api/auth/get-session')`**, which fails during SSR (relative URL, no cookies). Use `getSessionFn` through `sessionQueryOptions` / `freshSessionQueryOptions`, which run on the server during SSR and over RPC in the browser.

API:

```ts
// all take the beforeLoad args ({ context, location }) and return the SessionUser
requireAuth({ context, location })        // redirect to /auth/login?redirect=<href> if signed out
requireAdmin({ context, location })       // fresh session (no cookie cache); signed out -> login; non-admin -> '/'
optionalAuth({ context })                 // session or null, no redirect
requireNoSession({ context, search })     // auth pages: signed in -> sanitized redirect (replaces redirectIfSignedIn)
invalidateSession(queryClient, router)    // = refresh/clearSession in src/lib/session.ts (re-export, no duplicate logic)
```

- `_authed.tsx`: `beforeLoad: (ctx) => ({ user: requireAuth(ctx) })`.
- `_authed/_admin.tsx`: `requireAdmin(ctx)`. Give the fresh session its own query key (`['auth','session','fresh']`, `staleTime: 0`), or use `fetchQuery({ staleTime: 0 })`, so it really refetches. Then update the shared key so `useSession` agrees.
- Auth routes (`login`, `signup`, `forgot-password`, `reset-password`): `requireNoSession`. Delete `redirectIfSignedIn` and keep `redirectSearchParam` / `isSafeRedirect`.
- Keep the comment that guards are UX only and that server enforcement lives in tRPC procedures.

**Do we need middleware?**
- Today, no route depends on middleware for security: tRPC procedures, Better Auth, the Stripe webhook signature and the iCal token each enforce their own access.
- Add **TanStack Start function middleware** in `src/core/middleware/auth.ts`: `requireSessionMiddleware` and `requireAdminMiddleware` (`createMiddleware({ type: 'function' }).server(...)`, which resolves the Better Auth session from request headers and passes `context.user`). Every **future** server function that reads or writes private data must use it. Add one test and an AGENTS.md rule. The API is `createMiddleware({ type: 'function' })`, attached per function with `.middleware([...])` or globally through `functionMiddleware`. Prefer per function, so the public `getSessionFn` stays public.
- Request middleware for security headers is 1.5.

Tests:
- e2e: anonymous `/account` and `/admin` redirect to login with `redirect`, a non-admin on `/admin` goes to `/`, and a signed-in user on `/auth/login` is redirected. Most of these already exist in `e2e/`; extend them.
- Unit: `requireNoSession` sanitises the redirect.

**Docs:** `SECURE_AUTH_IMPLEMENTATION.md`, `AGENTS.md` (session pattern section).
**Gate (e2e included), then commit:** "feat(auth): auth-check guards, magic link first, remove phone plugin, fix auth forms".

---

## Phase 3: Payments (Checkout Sessions) and booking integrity

Read `stripe-best-practices` (references/payments.md) and the Stripe docs "Accept a payment" with Checkout Sessions + Elements + React (`docs.stripe.com/payments/accept-a-payment.md?payment-ui=elements&api-integration=checkout&client=react`). API version `2026-10-28.endive`, sandbox only.

### 3.00 Phase 3 decisions (2026-11-08, after Phase 4; these override 3.0–3.9 where they differ)

| Topic | Decision |
|---|---|
| Dispute notifications | **Every new Stripe event on a dispute marks its inbox item unread again** (`charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated`). The item's title and summary show the latest change. A replay of an event already applied, or an event older than the last one applied (out of order), updates nothing and does not resurface. `payment_disputes` stores `last_stripe_event_id` and `last_stripe_event_created` for this check; call `createInboxItem` (dedupe `dispute:<stripeDisputeId>`, `resurfaceAfterSeconds: 0`) only after the dispute upsert reports a newer event. |
| Refund emails | **Keep sending the app's own refund emails** to the guest and the admins for refunds made in the Stripe Dashboard (3.4), even though Stripe sends its own receipt. They carry **the full booking details, like the confirmation email**: confirmation id, guest name, email and phone, room, check-in and check-out dates with times, nights, guests, special requests, and the price breakdown (base, taxes, fees, total paid), followed by the refund section. Build one shared booking-details email section and use it in the confirmation, cancellation and refund emails. |
| Refund notifications | Dashboard refunds also create an inbox item: kind **`refund_issued`** (source `stripe`), dedupe `refund:<refundId>`, linked to the booking and guest, resurfaced on each refund status change. Refunds the app makes (cancellations) still get no second email and no inbox item; `refund_auto` and `refund_failed` stay as they are. |
| B3 | **Closed:** a hold created before the 9:00 AM CT same-day cutoff can still be paid until it expires. `confirmBookingPayment` and the Checkout fulfilment do not re-check the cutoff. |
| B4 | **Closed:** after the 3.0 doc and again when Phase 3 is done, the agent gives the user the exact event list for the sandbox webhook endpoint and the Link check; the user makes those Dashboard changes (listed in the Phase 3 report). |
| B5 | **Closed:** `HOLD_MINUTES` goes from 30 to 35, and the Checkout Session `expires_at` equals the hold expiry. |
| B7 | **Closed:** the admin cancel dialog for a booking with an open dispute shows a warning, defaults the refund to "none", and needs an explicit confirmation to refund. |

### 3.0 Document the webhook events first (`docs/STRIPE_WEBHOOKS.md`)

Before writing the Checkout Session code, add a separate section to `docs/STRIPE_WEBHOOKS.md`, "Booking payments with Checkout Sessions (Phase 3)". It lists what the `/api/stripe/webhook` endpoint must subscribe to, and what the app will do with each event:

| Event | Required | What the app does |
|---|---|---|
| `checkout.session.completed` | yes | `payment_status: 'paid'` → confirm the booking. `unpaid` (delayed method) → `paymentStatus: 'processing'`, keep the hold. |
| `checkout.session.async_payment_succeeded` | yes | Confirm the booking (delayed methods). |
| `checkout.session.async_payment_failed` | yes | Release the hold and email the guest. |
| `checkout.session.expired` | yes | Release the hold if it's still pending and not processing. |
| `refund.created` | yes | Refund details: sync status and amounts, cancel on a full Dashboard refund, email guest + admins (3.4). |
| `refund.updated` | yes | Status changes (succeeded, failed, requires_action) and the trace reference (ARN). Email only on meaningful changes. |
| `refund.failed` | yes | Admin alert with `failure_reason`. |
| `charge.refunded` | yes | Totals sync (`amount_refunded`); no email. |
| `charge.dispute.created` | yes | Store the dispute (3.4b), link it to the booking and user, create an admin inbox notification (no email). |
| `charge.dispute.updated` | yes | Update the stored dispute (status, evidence due date, reason) and mark the inbox item unread again (3.00). |
| `charge.dispute.closed` | yes | Store the outcome (`won` / `lost` / `warning_closed`) and mark the inbox item unread again with the result. |
| `charge.dispute.funds_withdrawn` / `charge.dispute.funds_reinstated` | yes | Update the stored dispute's balance info and mark the inbox item unread again (3.00). |
| `payment_intent.payment_failed` | optional | Log only. The Payment Element shows the error, and the hold stays until it expires. |

The section also covers:
- the events that are no longer needed (`payment_intent.succeeded`)
- the new `stripe listen --events ...` command
- `stripe trigger` examples for the new events, with any fixture overrides needed on `2026-10-28.endive`
- a note that Better Auth's endpoint is unchanged

Keep the current (PaymentIntent) section until the new handlers ship, then delete it in the same commit as the code. When Phase 3 is done, update the section to match `dispatch` in `src/lib/stripe-webhook.ts` exactly, and tell the user which events to change on the sandbox endpoint.

### 3.1 Checkout Session creation (`preparePayment` → `prepareCheckout`)

The server creates one Checkout Session per hold:
- `mode: 'payment'`, `ui_mode: 'elements'`
- `customer`: the Better Auth Stripe customer (`ensureStripeCustomer`), so the email comes from the customer
- `line_items` built with `price_data` from **our** pricing:
  - "Room name, N nights"
  - one line per fee
  - state tax and city tax as separate lines

  **Do not enable `automatic_tax`.** We calculate taxes ourselves, and the skill warns against `automatic_tax` without a registration.
- `amount_total` must equal `toCents(booking.totalAmount)`. Assert it after creation.
- Link to the booking (decision):
  - `client_reference_id`: the booking `id`
  - `metadata` and `payment_intent_data.metadata`: `{ bookingId, bookingPublicId, confirmationId, source: 'irishette' }`
  - `payment_intent_data.description`: `Irishette booking <confirmationId>`
  - no personal data in metadata
  - a shared `stripeBookingMetadata(booking)` helper in `src/lib/stripe.ts`, used for sessions, intents and refunds, with a unit test that checks the keys and that no personal data is included
- **No saved cards (decision).** Don't send `payment_intent_data.setup_future_usage` (today's `preparePayment` sends `setup_future_usage: 'off_session'`). Set `saved_payment_method_options: { payment_method_save: 'disabled' }` explicitly (it is the default; stripe 23.1.0 types).
- **Link:** dynamic payment methods show Link in the Payment Element when it is enabled in the Dashboard payment method settings. The session's `customer` email lets Link recognise returning Link users. Nothing is stored on our side. Add a note to `STRIPE_PAYMENT_INTEGRATION.md` and ask the user to check that Link is enabled in the sandbox. The `ContactDetailsElement` isn't needed, because the customer email comes from the session.
- `return_url`: `<BETTER_AUTH_URL>/booking/confirmation/<publicId>?session_id={CHECKOUT_SESSION_ID}`
- `expires_at` = the hold's expiry. Stripe allows 30 minutes to 24 hours after creation (confirmed). `HOLD_MINUTES` is 30 today (`src/lib/availability.ts`). **Decision (B5):** raise it to 35, so that `expires_at` is always at least 30 minutes after the session is created, even with clock skew and the time spent creating the session. Hold and session expire at the same moment.
- `integration_identifier`: e.g. `irishette_booking_<8 random letters>`
- idempotency key `checkout/<bookingId>/<holdExpiresAt>/<amountCents>`
- no `payment_method_types` (dynamic payment methods)

Save `stripeSessionId` on the booking. On confirmation, also save `stripePaymentIntentId` and the charge id (`payment_transactions.stripe_charge_id`, new column, from the intent's `latest_charge`). Disputes and refunds reference the charge, so both can be looked up without a Stripe call. Reuse the open session while the hold and amount are unchanged. Otherwise `checkout.sessions.expire` the old one before creating a new one.

**Refreshing a hold:** a session's expiry can't be extended. If the hold is refreshed past the session's `expires_at`, create a new session (expire the old one) and send the new client secret to the client.

**Booking priority (decision):** `createHold` already rejects dates covered by another guest's *live* hold. In addition, when a new hold covers dates of an **expired** hold, call `checkout.sessions.expire` on that hold's session first:
- If Stripe says the session is already complete, confirm that booking and reject the new hold.
- Otherwise mark the old hold expired (or delete it, matching the cron).

Confirmation then only has to guard against confirmed bookings, live holds created earlier, external events and blocks. Document the rule in `BOOKING_ARCHITECTURE.md`.

### 3.2 Client (`PaymentStep.tsx`)

- Use `CheckoutElementsProvider` (`stripe={loadStripe(pk)}`, `options={{ clientSecret }}`, `elementsOptions.appearance` matching the current Payment Element styling), `useCheckoutElements()`, `<PaymentElement />` and `checkout.confirm()`, all imported from `@stripe/react-stripe-js/checkout` (exports confirmed in the installed 7.0.1; `@stripe/stripe-js` 10.2.1).
- Show the line items and total from `checkout` next to our summary, and assert they match.
- Disable the Pay button unless `canConfirm`. Show `confirm()` errors and don't log whole error objects.
- Return page (`_authed/booking/confirmation.$publicId.tsx` with `session_id`): call `bookings.confirmCheckout` (3.3), then render by status: confirmed / processing (delayed payment methods) / expired / cancelled.

### 3.3 Fulfilment (webhook first, return page as a fast path)

Per the skill, fulfilment is driven by the webhook:
- **`checkout.session.completed`:** if `payment_status` is `paid` (or `no_payment_required`), confirm. If it's `unpaid` (delayed payment method), set `paymentStatus: 'processing'` and keep the hold.
  - `holdsDatesCondition` must also count `pending` bookings with `paymentStatus = 'processing'` even after `expiresAt`. Otherwise another guest could hold the dates while a bank payment is pending.
  - The expired-holds cron and `checkout.session.expired` must skip processing holds.
  - Add a test.
- **`checkout.session.async_payment_succeeded`:** confirm.
- **`checkout.session.async_payment_failed`:** release the hold and email the guest.
- **`checkout.session.expired`:** release the hold if it's still pending and unpaid.

`confirmBookingPayment(deps, bookingId, sessionId)`:
- retrieve the session, expanding `payment_intent`
- check `metadata.bookingId`, `amount_total`, `currency` and `payment_status`
- run the guarded update to `confirmed`, setting `paymentStatus: 'paid'`, `stripePaymentIntentId` (from the session) and `stripeCustomerId`
- insert `payment_transactions`
- send the emails

It must be idempotent: webhook plus return page, and replays. If dates are taken despite the priority rule (an iCal import or admin block arrived in the meantime), keep the current automatic refund + alert path.

`bookings.confirmCheckout` (protected): the return-page fast path. It calls the same function with the owner's booking and `session_id`. It replaces `bookings.confirmPayment`; update the authz lists.

Remove `payment_intent.succeeded` handling, unless a manual PaymentIntent is still possible (**VERIFY**). Then finish the 3.0 doc update (final event list and `stripe listen --events` command), and **tell the user** to update the sandbox dashboard endpoint's events.

Tests: msw mocks for `checkout.sessions.create/retrieve/expire`, plus a webhook test for each event and replay. The e2e Stripe flow (`E2E_STRIPE=1`) is updated to work with Checkout Elements.

### 3.4 Refund webhooks and emails

The Stripe docs recommend `refund.created` as the minimum. `charge.refunded` doesn't include refund details on current API versions (`refunds` isn't expanded).

- **`refund.created` / `refund.updated` / `refund.failed`:** find the booking by `refund.payment_intent`, falling back to `metadata.bookingId`. Retrieve the charge (`refund.charge`) for `amount`, `amount_refunded`, `payment_method_details.card.brand/last4` and the receipt URL.
  - **Refunds made by the app** (`metadata.source === 'irishette'`; every refund the app creates gets `stripeBookingMetadata(booking)` plus a `reason`): only sync the status. The cancellation email already covered it, so no second email.
  - **Refunds made in the Dashboard:**
    - Full refund of a confirmed booking (`amount_refunded >= amount`): cancel the booking (`cancelledBy: 'system'`, `cancellationReason: 'refunded_in_stripe'`), which frees the dates (`holdsDatesCondition` in `src/lib/availability.ts` only counts `confirmed` and live `pending`, so cancelled bookings never block; confirmed).
    - Partial refund: update `refundAmount` (total refunded so far) and `paymentStatus: 'partially_refunded'`.
    - Both: update `payment_transactions`.
  - **Email** the guest and the admins (new `sendRefundEmails` in `email-service.ts`, idempotency key `refund/<refundId>/<status>`).
    - Booking details: the full set from the confirmation email, through the shared booking-details section (3.00): confirmation id, guest name, email and phone, room, check-in/out with times, nights, guests, special requests, base, taxes, fees and total paid.
    - Refund details from the webhook:
      - refund amount and currency
      - total refunded so far and the remaining paid amount
      - `reason` (`requested_by_customer` / `duplicate` / `fraudulent` / other), shown in plain words
      - status (`pending`, `succeeded`, `failed`, `requires_action`)
      - refund id, date (`created`)
      - card brand and last 4
      - the trace reference (`destination_details.card.reference`, ARN) when `refund.updated` provides it
    - The new booking status (cancelled, or still confirmed after a partial refund).
    - Guest copy says refunds take 5–10 business days (Stripe docs). Fix the existing cancellation email, which says 3–5.
    - Admin copy links to the booking.
  - **Inbox:** a `refund_issued` item (3.00), dedupe `refund:<refundId>`, resurfaced on each status change.
  - **`refund.failed`:** keep the admin alert and add `failure_reason`. The guest is not emailed (an admin follows up).
- **`charge.refunded`:** keep it as a totals sync only (no email). Make every handler idempotent on refund id plus status.
- **Decision:** send the refund emails for `refund.updated` only when the status changes to `succeeded` or `failed`, or when a reference becomes available. Don't email for metadata-only updates.

### 3.4b Disputes (decision)

- **Schema** (`src/db/booking-schema.ts`, baseline regenerated). `payment_disputes`:
  - ids: `id` (UUIDv7), `stripe_dispute_id` (unique), `stripe_charge_id`, `stripe_payment_intent_id`
  - links: `booking_id` (FK, nullable if no match), `user_id` (FK, nullable)
  - from the webhook:
    - `amount`, `currency` (same money convention as `bookings`)
    - `reason` (`fraudulent`, `product_not_received`, `duplicate`, ...), `status` (`warning_needs_response`, `needs_response`, `under_review`, `won`, `lost`, ...)
    - `network_reason_code` (from `payment_method_details.card`, when present)
    - `evidence_due_by` (UTC seconds)
    - `is_charge_refundable`, `livemode`
    - `stripe_created_at`, `closed_at`, `funds_withdrawn_at`, `funds_reinstated_at`
    - card brand/last4 (from the charge)
  - `created_at`, `updated_at`
  - Indexes: `booking_id`, `user_id`, `(status, evidence_due_by)`.
- **Linking:** take `dispute.payment_intent`, retrieve the PaymentIntent and read `metadata.bookingId` (decision). Fall back to `payment_transactions.stripe_charge_id` / `bookings.stripePaymentIntentId`, then set `user_id` from the booking. If nothing matches, still store the dispute and notify with "unlinked payment".
- **Inbox:** a `stripe` / `payment_dispute` item (Phase 4 inbox, `createInboxItem` with `dedupe_key` `dispute:<stripeDisputeId>` and the new `payment_dispute_id` column) with the title "Dispute: <confirmationId>, <amount>, <reason>, respond by <due date CT>". It links to the booking page and the Stripe Dashboard dispute URL. No email (decision).
- **UI:**
  - The admin booking page and the admin guest page get a "Payment disputes" panel showing status, amount, reason, the due date (CT) and the outcome.
  - A badge on the booking in the admin lists while a dispute is open.
- **Refunds during a dispute:** Stripe warns that refunding a disputed charge can credit the guest twice (`charge_for_pending_refund_disputed`).
  - Guest online cancellation of a booking with an open dispute returns `CONFLICT` ("Please contact us").
  - The admin cancel dialog shows a warning, defaults the refund to "none", and needs explicit confirmation to refund (B7, decided).
- **Idempotency:** upsert by `stripe_dispute_id`. Replays and out-of-order events (updated before created) don't create duplicate inbox items. Each newer event marks the item unread again; a replay or an older event does not (`last_stripe_event_id` / `last_stripe_event_created`, 3.00).
- **Tests (msw + signed fixtures):**
  - created → stored, linked and an inbox item made
  - updated and closed (won/lost)
  - an unlinked dispute
  - a replay
  - the guest cancel block
  - no email sent

### 3.5 Cancellation window (guest self-service): gaps to fix

The server rules are correct (see section 2). Fix these:
1. **Partially refunded bookings:** `amountPaid` is 0 unless `paymentStatus === 'paid'`, so a booking partly refunded in Stripe gets no further refund on cancellation. Refund the policy percent of the **original total**, capped at what is still paid (`totalAmount - refundAmount`). This is the user's decision. Add tests: a partial refund followed by a policy-tier cancellation, and a full refund (nothing left, so no Stripe call).
2. **Quote drift:** the dialog shows the quote when it opens, but the server recalculates when the guest confirms. If a tier boundary passes in between (e.g. 72 h), the guest gets less than they were shown. Add `expectedRefundAmount` to `cancelBookingSchema`. If the server's amount differs, throw `CONFLICT` with the new quote, and have the dialog refresh and ask again. Add a test.
3. **Order and idempotency:** see 3.7. Save the cancellation before refunding, and use a refund idempotency key that includes the amount.
4. **Reference time and windows (decision):** check-in is `bookings.check_in_at` (4:00 PM CT on the check-in date, stored in UTC; 3.9). Tier cutoffs are **America/Chicago wall-clock**:
   - `cutoff(tier) = zonedTimeToUtc(checkInDate minus floor(h/24) days, 16:00 minus (h mod 24) hours, 'America/Chicago')`. For the default 72 h and 24 h tiers this is 4:00 PM CT three days before and one day before. The local time stays 4:00 PM across DST.
   - The refund tier is the first tier (most notice first) with `now <= cutoff`. At exactly the cutoff the **higher** refund applies (decision). From `check_in_at` on, guests can't cancel online.
   - The Chicago offset comes from `Intl` for that date (`timezone.ts`), never from the server or browser time zone. Tests run in UTC (unit project `TZ=UTC`). Add a test with `TZ=Asia/Tokyo` to prove that the server time zone doesn't matter.
   - The API returns each tier's cutoff as a UTC instant (`refundCutoffs: [{ refundPercent, until }]`). The UI formats it in CT with a shared formatter ("Full refund until Tue, Jun 7, 4:00 PM CT"), never in the browser's time zone.
   - Replace `hoursBeforeCheckIn` in `quoteCancellation` with the cutoff comparison. The admin policy page explains that tiers are "hours before 4:00 PM CT check-in, counted on the local clock".
   - Tests:
     - exactly at, 1 second after, and 1 second before each cutoff
     - after check-in
     - check-ins just after DST starts (second Sunday of March) and ends (first Sunday of November), where the 72 h cutoff must still be 4:00 PM local
     - a non-multiple-of-24 tier (e.g. 36 h → 4:00 AM CT one and a half days before)
   - Record the applied tier on cancellation: add `cancellation_refund_percent` and `cancellation_cutoff_at` (UTC seconds) to `bookings`, written with the cancel update.
5. **UI:**
   - Hide or disable the guest Cancel button once check-in time has passed (use `checkInAt` from the booking or a preloaded quote, not only the dialog).
   - Show the policy tiers and "free cancellation until <date/time>" on the booking page and at checkout. Checkout currently links only to the static page; use `policies.getCancellationPolicy`.
   - The legal page mentions `/manage-bookings` and a placeholder phone number `(123) 456-7890`. Report this to the user; don't edit the page.

### 3.6 Statuses

- **Booking `status`:** `pending | confirmed | cancelled`, enforced with a Drizzle `text('status', { enum })` and one shared Zod enum. Remove `completed` from `listStatusSchema` and the five UIs (admin current/past bookings, guest page, account index/past).
- **Proposed** API additions (computed, not stored):
  - `stayPhase: 'upcoming' | 'in_stay' | 'past'`, computed in property time:
    - `upcoming`: before check-in date at `CHECK_IN_TIME`
    - `in_stay`: from then until the check-out date at `CHECK_OUT_TIME`
    - `past`: after that

    The account and admin lists use it instead of the browser date, which also fixes the date-filter problems.
  - `canCancel` and `cancelUntil` on guest booking responses.
- **`paymentStatus`:** `pending | processing | paid | partially_refunded | refunded | refund_pending | refund_failed`, as a shared enum. Remove `failed`: a failed payment leaves the hold `pending` until it expires.
- **`payment_transactions.status`:** align with `paymentStatus`.
- Regenerate the baseline.

### 3.7 Cancellations: save first, then refund

`cancelConfirmed`:
1. Guarded update to `cancelled` with `paymentStatus: 'refund_pending'`.
2. Create the refund (`metadata.source: 'irishette'`, idempotency key `refund-cancel/<bookingId>/<amountCents>`).
3. Set `refunded` / `partially_refunded`. On failure, set `refund_failed` and alert the admins. The booking stays cancelled.

Add a test for each branch.

### 3.8 Booking flow bugs

- **Zero fee or tax:** `BookingDetailsStep.tsx` (`handleContinue`) and `routes/booking/index.tsx` (`onPricingDataFetched`) reject `feesAmount`/`taxAmount` of 0. Check `== null` instead, and add a test.
- **"Today":** `availability.getBySlug` returns `today` in property time, and the calendar uses it.
- **Limits:** enforce the 30-night maximum and the 10-month window in `createHold`, with the limits shared in `src/lib/date-range.ts`.
- **Confirmation page** shows the real status (see 3.2).
- **Account pages:**
  - add pending/processing and cancelled sections
  - "Resend confirmation" only for confirmed bookings
  - "Contact Support" links to `/contact?booking=<confirmationId>` (Phase 4)
  - remove the placeholder footer text
- **Booking steps:** validate `?step=` and redirect to the furthest allowed step. Remove the unused `dates`/`confirmation` steps.
- **Client validation:** the details form uses the shared Zod schemas.
- **Admin blocks:** make `assertBlockAllowed` + insert one guarded insert (atomic).
- **Unused column:** remove `bookings.stripeSessionId`'s "unused" status in `BOOKING_ARCHITECTURE.md` (it's now used). Keep `discountAmount` with a comment: reserved for discounts, not yet set.

### 3.9 Fixed check-in and check-out times

Decision: check-in is **4:00 PM (16:00) America/Chicago** for all logic.
- **One source of truth:** `CHECK_IN_TIME`, `CHECK_OUT_TIME` and `PROPERTY_TIMEZONE` in `src/lib/site.ts` (Phase 0). Add `checkInAt(date)`, `checkOutAt(date)` and `localCutoff(date, time, hoursBefore)` helpers (wall-clock arithmetic in America/Chicago, then `zonedTimeToUtc`) in `src/lib/timezone.ts` or `date-range.ts`, and use them everywhere instead of building times inline.
- **Normalized timestamps in D1 (decision):**
  - **Rule (write it into `AGENTS.md`):**
    - Every instant is stored as UTC Unix seconds (`integer(..., { mode: 'timestamp' })`). Never `timestamp_ms`, local-time text or ISO strings.
    - Stay dates are property-local `YYYY-MM-DD` text.
    - Times of day exist only as constants in `site.ts`.
    - Today all 36 timestamp columns already follow this. Check new ones in review.
  - Add `bookings.check_in_at` and `bookings.check_out_at` (`notNull`), computed with `checkInAt`/`checkOutAt` when the hold is created (`createHold`) and whenever dates change. Seeds (`scripts/seed-local.sql`) and test helpers (`test/workers/seed.ts`, `helpers.ts`) set them too.
  - Index `(status, check_in_at)` for the queries below.
  - Use them in:
    - `quoteCancellation` (reads `booking.checkInAt` instead of rebuilding it from the date)
    - the guest cancel cutoff
    - `cancelUntil` / tier cutoffs in responses
    - `stayPhase` (SQL can now filter upcoming/in-stay/past directly: `check_in_at > now`, `check_out_at <= now`, ...)
    - the account/admin list filters
  - A unit test checks that `checkInAt('2030-06-10')` is `2030-06-10T21:00:00Z` (CDT) and that the January date gives `22:00Z` (CST).
  - A workers test checks that a created hold stores the right `check_in_at`.
  - Baseline regenerated (decision: single baseline).
- **Cancellation policies:**
  - Remove `checkInTime` and `timezone` from `CancellationPolicy`, `cancellationPolicyInputSchema`, the admin cancellation-policy page and `policies.*` responses.
  - Drop `cancellation_policies.check_in_time` and `timezone` from `src/db/policy-schema.ts` and regenerate the baseline.
  - `quoteCancellation` uses `checkInAt(checkInDate)`.
  - Existing tests that set `checkInTime: '15:00'` change to test the fixed time.
  - The admin page shows "Windows count back from check-in at 4:00 PM CT" as read-only text.
- **Uses of the time:**
  - the guest "can cancel" cutoff (3.5)
  - `cancelUntil` / tier cutoffs in API responses
  - `stayPhase` (3.6)
  - the cancel dialog text (`CancelBookingButton`)
  - the booking, confirmation and account pages
  - `BookingConfirmationEmail` and the cancellation and refund emails
  - `contact.tsx` ("Check-in: 4:00 PM, Check-out: 11:00 AM")

  All of these format the constants instead of hardcoding text. The legal pages stay untouched.
- **iCal export** stays all-day (date-only) events. Times are not added; platforms treat iCal blocks as whole days.
- **Check-out** is 11:00 AM CT (`CHECK_OUT_TIME = '11:00'`, decision).
- **Same-day cutoff (decision): 9:00 AM CT.**
  - Add `SAME_DAY_CUTOFF_TIME = '09:00'` to `site.ts`, and `earliestCheckInDate(now)` to `date-range.ts`: today if `now` is before 09:00 CT on today's property date, else tomorrow.
  - Server: `createHold` and `calculateBooking` reject a check-in before `earliestCheckInDate(now)` with `BAD_REQUEST` ("Same-day bookings close at 9:00 AM CT").
  - **Decision (B3):** a hold created before 9:00 AM can still be paid until it expires (the guest started in time). `confirmBookingPayment` doesn't re-check the cutoff.
  - Client: `availability.getBySlug` returns `earliestCheckIn` (with `today`). The calendar disables earlier days and shows a short note on today after the cutoff. Use the server value, not the browser clock.
  - Tests: 08:59 vs 09:00 CT, across a DST date, with the unit project in UTC.
  - Show the rule on the room page / calendar note. The legal pages are unchanged.
- **Tests:**
  - DST: check-in on the second Sunday of March and the first Sunday of November
  - `stayPhase` at the 4:00 PM and 11:00 AM edges
  - the cutoff equals 4:00 PM CT regardless of the server timezone (unit project runs in UTC)
  - the same-day cutoff (above)

**Docs:**
- `STRIPE_PAYMENT_INTEGRATION.md` (rewrite for Checkout Sessions)
- `STRIPE_WEBHOOKS.md` (events, listen command)
- `BOOKING_ARCHITECTURE.md` (priority rule, statuses, refunds, check-in/out times, cancellation windows)

**Gate (e2e with `E2E_STRIPE=1` if available), then commit:** "feat(payments): Stripe Checkout Sessions, refund webhooks and emails, booking fixes".

---

## Phase 4: Contact form (email only) and admin notification inbox (runs before Phase 3)

### 4.0 Phase 4 decisions (2026-11-08; these replace the earlier 4.1–4.4 draft)

**Update (2026-11-08, during Phase 4; overrides "nothing stored" below):** the user asked for each contact form submission to also appear in the admin notifications (source `guest`, kind `contact_form`, the message in `details`, kept until deleted) with a **Reply by email** button: a `mailto:` link to the address the guest typed. The email to `CONTACT_EMAIL` (guest as reply-to) stays. Replying from the dashboard and inbound email stay deferred. Other choices made while executing: sidebar label **Notifications** (route `/admin/inbox`); keyset pagination (accepted); the Turnstile `hostname`/`action` checks were **not** adopted (success check only); contact docs in their own `docs/CONTACT_FORM.md`. The list orders by a `surfaced_at` column (set on create and on resurface) with `public_id` as the keyset tiebreak, plus an `occurrences` counter, so a resurfaced item moves to the top and cursors never carry primary keys; `createInboxItem` takes `resurfaceAfterSeconds` (conflicts resurface at most daily).

- **Scope cut:** storing contact messages, replying from the dashboard and two-way guest email are **deferred** to `.agents/plans/deferred-email-messaging.md` (the client has not asked for them). Phase 4 ships:
  1. a contact form that only **emails the admin** (nothing stored), and
  2. an **internal admin notification inbox** for Stripe and system events.
- **Contact form:** a public TanStack Start **server function** (not a tRPC mutation) with a Zod `.validator()`. The handler verifies the Turnstile token with Siteverify, then sends one email to `CONTACT_EMAIL` (`src/lib/site.ts`) with the form data and `replyTo` set to the guest's address, so the admin answers from their own mail client. **No email to the guest.** No D1 row, no inbox item.
- **Rate limit:** start loose: the existing `API_RATE_LIMITER` binding (30/60 s per IP) under the key scope `contact.submit`, via a new function-middleware variant. Tighten only if the "rate-limited" log lines show abuse.
- **Inbox sources and tags:** every item has a `source` (`stripe` | `system`; `guest` is reserved for the deferred plan) and a `kind`. The UI filters by source, so admins can tell Stripe events from system notices.
- **B8 (answered):** the four existing admin alert emails also create inbox items in Phase 4. The emails stay.
- **Unread badge:** cached with TanStack Query (`inbox.adminUnreadCount`, `refetchInterval` 5 minutes, refetch on window focus). Opening an item runs `inbox.adminSetStatus` (read) with an optimistic update of the row and the badge, then invalidates the inbox queries (`pathFilter`) so the server value wins.
- **Status is shared** between admins (at most two): one `status` per item, not per admin.
- **Retention:** items are kept until an admin deletes them (no cron).

### 4.1 Schema (`src/db/inbox-schema.ts`, registered in `schema-export.ts`, baseline regenerated)

**`admin_inbox_items`** (one table, single indexed list query):
- `id` (UUIDv7), `public_id` (nanoid)
- `source` (`stripe` | `system`)
- `kind`:
  - Phase 4: `refund_auto` (dates taken, payment refunded), `refund_failed`, `ical_sync_failed`, `ical_conflict`
  - Phase 3 adds `payment_dispute` and `refund_issued` (3.00)
- `title`, `summary` (short, for the list; no guest message bodies, no card data)
- `details` (small JSON text: kind-specific fields such as amounts, Stripe ids, feed id, due dates; no secrets, no full webhook payloads)
- `status` (`new` | `read` | `archived`), `read_at`, `archived_at`
- `booking_id` (nullable FK, `SET NULL`), `user_id` (nullable FK, `SET NULL`)
- `dedupe_key` (nullable, unique): makes creation idempotent across webhook replays and cron retries, e.g. `refund_failed:<refundId>`, `ical_sync_failed:<feedId>:<YYYY-MM-DD>`; Phase 3 uses `dispute:<stripeDisputeId>`
- `created_at`, `updated_at`

Indexes:
- `(status, created_at DESC, id)`
- `(source, status, created_at DESC)`
- `(booking_id, created_at DESC)`
- `(user_id, created_at DESC)`
- unique `(dedupe_key)`

Phase 3 adds `payment_dispute_id` (nullable FK to `payment_disputes`, `SET NULL`) when it creates that table. Deleting a dispute inbox item removes only the notification; the dispute record stays (financial record).

### 4.2 Server

- **`src/lib/inbox-service.ts`** (Fallow `server` zone): `createInboxItem(deps, item)`: insert, or on a `dedupe_key` conflict update the title, summary and details and set `status` back to `new` (a repeated problem resurfaces). Used by webhooks, cron handlers and later Phase 3. Never throws into the caller's main work: run it like the alert emails (`inBackground` / `waitUntil`), and log failures with the item's kind and dedupe key only.
- **Mirror the existing alerts (B8)** next to each `sendAdminAlert` call:
  - `src/lib/booking-service.ts`: automatic refund when the dates were taken → `system` / `refund_auto` (booking linked)
  - `src/lib/stripe-webhook.ts`: `refund.failed` → `stripe` / `refund_failed` (booking linked when found)
  - `src/lib/ical-sync.ts` `alertFeedProblem` → `system` / `ical_sync_failed`
  - `src/lib/ical-sync.ts` `alertConflicts` → `system` / `ical_conflict` (bookings linked)
- **`src/integrations/trpc/inbox.ts`** (all `adminProcedure`, inputs by item `publicId`):
  - **`adminList`:** server-side pagination for TanStack Table. Input `{ status?: 'new'|'read'|'archived'|'inbox', source?, kind?, search?, pageSize (≤100), cursor? }` (`inbox` = new + read). Keyset pagination on `(created_at, id)` (**Proposed** over offset). If the table needs page numbers, a separate `COUNT(*)` runs only when filters change. Selects list columns only, plus a left join for the booking confirmation id and guest name. Search is a bounded `LIKE` on title and summary.
  - **`adminUnreadCount`:** `COUNT(*) WHERE status = 'new'`.
  - **`adminGet`:** the item, its parsed `details`, and linked booking/guest summaries.
  - **`adminSetStatus`:** read / unread / archived / unarchived, batch ids.
  - **`adminDelete`:** batch.
  - **`adminListForBooking`**, **`adminListForUser`:** small limited lists for the admin booking and guest pages.
  - Register the router; add every procedure to `trpc-authz.test.ts` (none are public).
- **Contact form:**
  - `src/lib/contact-validation.ts`: `contactSchema`: name (2–100), email, optional phone (`phoneNumberSchema`), subject (max 150, no line breaks), message (10–5000), optional booking confirmation id (format-checked only, never looked up), Turnstile token.
  - `src/lib/turnstile.ts` (Fallow `server` zone): Siteverify with `TURNSTILE_SECRET_KEY`, `remoteip` from `cf-connecting-ip`, a timeout, fail closed. **Proposed:** also check `hostname` against the site host and an `action` of `contact` (set on the widget).
  - `src/lib/contact-service.ts` (Fallow `server` zone): `submitContactForm(deps, input, ip)`: Turnstile, then `sendContactNotification`. Testable without Start.
  - `src/core/functions/contact.ts`: `submitContactFn = createServerFn({ method: 'POST' }).middleware([rateLimitFnMiddleware('API_RATE_LIMITER', 'contact.submit')]).validator(contactSchema).handler(...)`. Public on purpose (no private data), so no session middleware; note this next to the AGENTS.md rule.
  - `src/core/middleware/rate-limit.ts`: add `rateLimitFnMiddleware` (function middleware: 429 via `setResponseStatus`, keyed by IP, same log line as today).
  - `email-service.ts`: `sendContactNotification` (subject "Contact form: <subject>", `NotificationEmail` with the fields, `replyTo` = guest email). Logs never include the message body or the guest's email.
  - Response: `{ ok: true }` or a generic error with "email us directly at CONTACT_EMAIL". A failed Turnstile check returns a mapped message, like the auth forms.

### 4.3 Client

- **`src/routes/contact.tsx`:**
  - Fields: name, email, phone (optional), subject, message, booking confirmation ID (optional, prefilled from `?booking=`; Phase 3's "Contact Support" link uses it).
  - Prefilled name/email/phone for signed-in users.
  - Reuse the auth form pieces: `TurnstileField` + `useTurnstile` (reset after every request), `AuthError`, and a `useAuthRequest`-style submit hook (generalize it if needed instead of copying). A success state ("Thanks, we'll reply by email").
- **`_authed/_admin/admin/inbox/index.tsx`** (sidebar label "Notifications" or "Inbox"; **ask the user**):
  - TanStack Table in manual mode (`manualPagination`, `manualFiltering`), reusing `src/components/data-table/`.
  - Search params validated with Zod (`status`, `source`, `kind`, `q`, `cursor`, `pageSize`) drive `useQuery(trpc.inbox.adminList.queryOptions(...))` with `placeholderData: keepPreviousData`. The loader calls `ensureQueryData` for SSR; the next page is prefetched.
  - Status tabs (Inbox / Archived), a source filter (All / Stripe / System) with a tag per row, unread rows in bold, bulk read / archive / delete with a confirmation dialog.
- **`inbox/$publicId.tsx`:** renders by kind: the summary, the details, links to the booking and guest pages (and the Stripe Dashboard for Stripe items). Opening it marks it read (optimistic, see 4.0).
- **Unread badge** in `AdminSidebar` / `AdminNavigation` (see 4.0).
- **Admin booking and guest pages:** a small "Notifications" panel (`adminListForBooking` / `adminListForUser`).

### 4.4 Tests

Workers:
- `submitContactForm`: Turnstile pass, fail and timeout (msw); the admin email goes to `CONTACT_EMAIL` with `replyTo` = guest (Resend mocked); nothing is written to D1; the error leaks nothing.
- `createInboxItem`: insert, dedupe (same key updates and resurfaces), linking.
- Each mirrored alert creates its inbox item (automatic refund, `refund.failed` webhook, feed failure, conflict).
- `inbox.*`: admin-only access (authz sweep), pagination order and cursor stability, filters by source/kind/status, unread count, bulk status changes, delete, per-booking and per-user lists.

Unit:
- `contactSchema` (line breaks in subject, lengths, phone).
- `rateLimitFnMiddleware` wiring (mocked, like `test/unit/server-fn-middleware.test.ts`).

E2E:
- The contact form renders, validates and shows Turnstile errors. **Submitting sends a real email** through Resend in `pnpm dev`, so the submit test runs only with `E2E_CONTACT=1` (skipped otherwise).
- The admin inbox page loads and hard-reloads cleanly (with the admin credentials).

**Docs:** new `docs/ADMIN_INBOX.md` (sources, kinds, dedupe keys, how to add a kind), the contact form in `docs/SECURE_AUTH_IMPLEMENTATION.md` or a short `docs/CONTACT_FORM.md` (**Proposed:** a section in `ADMIN_INBOX.md`), plus `TRPC_QUICK_REFERENCE.md` and `AGENTS.md` (architecture map, docs list, Fallow `server` zone list).
**Gate, then commit:** "feat: contact form and admin notification inbox".

---

## Phase 5: Base UI migration (shadcn) and React rule warnings

### 5.1 Preparation

- Use the shadcn skills installed in Phase 0. Before starting, run `pnpm dlx skills add shadcn/ui` again to pick up any update, and check the `skills-lock.json` diff. The migration runs one component at a time, writes a report per component to `.migration/`, and makes one commit per component. **Proposed:** commit the `.migration/` reports for this branch, then delete them in Phase 7.
- Run `pnpm dlx shadcn@latest info` and record the style (`new-york`), base color (`stone`) and icon library. **VERIFY** how the skill updates `components.json` for Base UI. Don't run `shadcn init --force` without asking.
- Run `pnpm dlx shadcn@latest migrate cn` first, as its own commit. It replaces the `twMerge(clsx())` helper in `@/utils/twMerge` with the `cn` package. Update `aliases.utils`, and check that Oxfmt's Tailwind class sorting still sees `cn(...)`.
- **Keep the styling.** Before migrating, run `pnpm dlx shadcn@latest add <c> --dry-run --diff` for each component to list the local customisations: the button's `font-bold`, the `outline`/`accent` variants, the `lg` size, and anything else. The migration must reproduce them. Take screenshots (Playwright) of the key pages before and after so they can be compared visually: home, a room page, the booking steps, login, account, the admin dashboard, admin room management, a dialog, the sidebar.

### 5.2 Migrate one component at a time

**Proposed** order: `separator`, `label`, `skeleton`, `input`, `textarea`, `card`, `badge`, `alert`, `table`, `checkbox`, `switch`, `collapsible`, `scroll-area`, `tooltip`, `dropdown-menu`, `dialog`, `sheet`, `sidebar`, `calendar` (react-day-picker 10; **VERIFY** the Base UI variant), `chart`, then **toast**.

- Mechanical changes: `asChild` → `render`, `data-[state=open]` → `data-open`, Portal/Positioner structure. The skill flags behaviour changes; check focus return, outside click, scroll lock and keyboard by hand.
- **Toast:** add shadcn's Base UI Toast (`pnpm dlx shadcn@latest add toast`) and mount its `Toaster` in `__root.tsx`. Replace every `toast.success/error(...)` from `sonner` with `toast.add({ type, title, description })` (`toast.promise` if used). Style it to match the current sonner toasts (position, colours, icons, duration). Then remove `sonner` and `ui/sonner.tsx`.
- After each component: `pnpm check`, `pnpm typecheck`, `pnpm build`, and a manual or screenshot check of the pages that use it.
- At the end:
  - remove the unused `@radix-ui/*` packages (`fallow dead-code --unused-deps`)
  - check that `pnpm install --frozen-lockfile` passes
  - re-take the screenshots and compare them
  - run e2e

### 5.3 React rule warnings

- **`react/purity` (15):** `new Date()` during render in the charts, `Footer`, `RoomAvailabilityCalendar`, `RoomPricingRules`, `RoomBlockingManagement`, the booking lists and `admin/index.tsx`. Use "today" from the loader or the server (3.6 `stayPhase`, 3.8 `today`), or a `useToday()` hook with a stable initialiser. `Footer`: build year.
- **`react/set-state-in-effect` (3):** `property-management/$publicId.tsx`, `reset-password.tsx`, `use-mobile.ts` (→ `useSyncExternalStore`).
- Then promote both rules to `error` in `vite.config.ts` and update AGENTS.md.

**Docs:** `AGENTS.md` (UI row: Base UI, `cn`, Toast; shadcn commands with `-b base`).
**Gate (e2e included), final commit:** "chore(ui): finish Base UI migration, fix React rule warnings".

---

## Phase 6: Refactors and duplication

These changes must not change behaviour; tests stay green after each step.

- **Room pages:** move the shared sections into `src/components/rooms/` (`RoomHero`, `RoomAmenities`, `RoomBookingPanel`, `RoomDetailsSection`; `RoomGallery` already exists). Each page keeps its own copy and image list. Room facts come from the loader.
- **Hardcoded slugs:** `BookingDetailsStep` ("Back", `roomSlug === 'rose-room'`) builds them from `booking.roomSlug`.
- **Booking detail:** shared `BookingSummaryCard` / `BookingPaymentCard` / `BookingGuestCard` for the admin and account pages. Admin-only panels stay on the admin page.
- **Booking lists:** one `BookingsTable` with column presets (admin current/past, account index/past), using `stayPhase`.
- **Auth emails:** `MagicLinkEmail` and `PasswordReset` share a layout, or become `NotificationEmail` variants.
- **Complexity:** split `BookingDetailsStep` (form, summary, submit hook), `parseIcal` (unfold, parse property, build event) and the rest of `SignupPage`. Target cognitive complexity ≤ 15.
- **Email senders:** stay hardcoded in `src/lib/site.ts` (decision; done in Phase 0). They change to the production domain at go-live; see the checklist below.
- **Bundle size:** the `email-service-*.js` chunk is 1.7 MB (react-email). Measure with `pnpm deploy:dry` (Touch ID) against Worker size limits, and trim imports if needed.
- Record the `fallow dupes` / `fallow health --targets` numbers before and after in the commit message.

**Gate, then commit:** "refactor: shared room, booking and auth components; reduce duplication".

---

## Phase 7: Wrap-up

- Promote Fallow `unused-exports`/`unused-types` to `error` if they are clean (ask). Consider a warn-only `duplicates.threshold`.
- Delete the `.migration/` reports if they were committed.
- Update `AGENTS.md` and the docs. Mark this plan **DONE** with an outcome section.
- Run the full gate. `fallow audit --base updates` should pass, or report each remaining inherited finding.
- Commit: "chore: plan 02 wrap-up".

---

## After the plan (user decisions needed)

- **Production go-live** (plan 01 leftovers):
  - Remote D1 gets the single baseline migration (approved approach; still ask before running).
  - Secrets: `wrangler secret put` / `--secrets-file`.
  - First `cf deploy`.
  - Live Stripe keys, plus live webhook endpoints subscribed to the Checkout Session and refund events.
  - Custom domain and `workersDev: false`.
  - 5-minute iCal cron evaluation.
  - Switch the CSP from report-only to enforced once testing is clean (1.5).
  - Connect the iCal export URLs.
- **Domain switch checklist** (before go-live; values are hardcoded on purpose):
  - `src/lib/site.ts`:
    - `SITE_URL`
    - the senders (`EMAIL_FROM_*`; drop "Dev" from the bookings sender name)
    - `EMAIL_REPLY_TO`, `CONTACT_EMAIL`
    - `CONTACT_PHONE`, once the client provides the real number
  - Verify the sending domain in Resend.
  - `BETTER_AUTH_URL` (a `@public` value baked in at build time) and the Better Auth trusted origins.
  - Stripe live webhook endpoint URLs, the Turnstile allowed hostnames, `docs/STRIPE_WEBHOOKS.md` hosts.
  - Legal pages (hardcoded):
    - `irishette.com` references
    - the `/manage-bookings` link, which does not exist; the route is `/account`
    - the placeholder phone `(123) 456-7890` (update once the client provides it)
  - Re-run `grep -rn "cobaltweb\|workers.dev\|irishette.com" src docs` and check each hit.
- A CMS for legal pages (later).
- Guest email messaging (stored contact messages, dashboard replies, inbound guest replies, message history in `/account`): **deferred**, see `.agents/plans/deferred-email-messaging.md`.
- Effect evaluation (plan 01 Appendix C).

---

## Appendix A: Findings this plan fixes

**High**
- Guest responses expose `internalNotes`, Stripe ids and full payment rows. → 1.1
- Admin role or ban changes lag up to 5 minutes; the admin layout's fresh check is usually skipped. → 1.2, 2.4
- `/sign-in/phone-number` gets around Turnstile and email verification. → 2.1
- Duplicate or orphaned PaymentIntents (no idempotency key; replaced intents not cancelled). → 3.1 (Checkout Sessions, one per hold)
- Two guests could both pay for the same dates (an expired hold stays payable). → 3.1 priority rule
- A refund can happen before the cancellation is saved. → 3.7
- A Dashboard full refund leaves the booking confirmed and holding its dates; nobody is notified. → 3.4
- Rooms with a 0% fee or tax can't be booked. → 3.8

**Medium**
- Redirect payment methods fail (no `return_url`); `processing` is unhandled. → 3.2, 3.3
- Partially refunded bookings get no refund on cancellation; the quote can drift between dialog and confirm. → 3.5
- Auth forms report success when the request failed; Turnstile isn't reset; stated link lifetimes are wrong; password rules differ. → 2.3
- Rate limits are per isolate. → 1.4
- Admin block creation isn't atomic. → 3.8
- Calendar "today" vs server timezone; night limits are checked on the client only; no same-day cutoff. → 3.8, 3.9
- Cards are saved (`setup_future_usage`) but never reused. → 3.1
- Disputes are not handled or linked to bookings; refunds during a dispute risk crediting twice. → 3.4b
- The confirmation page ignores status; account pages hide pending and cancelled bookings. → 3.2, 3.8
- Public room lookups return inactive rooms; `ical.testUrl` fetches arbitrary URLs. → 1.3
- Errors lose their messages or are logged twice. → 1.3

**Low**
- Loose input schemas, the full user row in `adminGetGuestDetails`, unused `trpcClient`, dead `ical.syncFeed`, the `calculateBooking` test gap. → 1.3
- `?step=` jumps, unused store steps, client/server validation mismatch, placeholder text, an inert Contact Support button. → 3.8
- Unused statuses (`completed`, payment `failed`); `stripeSessionId` unused. → 3.6, 3.1
- Browser console logs whole Stripe errors. → 3.2
- Hardcoded room slugs. → 6
- Hardcoded domain, emails and times spread across files; per-policy check-in time that can differ from the real 4:00 PM. → Phase 0, 3.9
- 19 React rule warnings. → 5.3
- Cancellation email says refunds take 3–5 business days (Stripe: 5–10). → 3.4

## Appendix B: Open items to confirm during execution

Resolved on 2026-11-07 (kept for the record):
- the refund rule for partially refunded bookings (decision)
- the check-in reference time (4:00 PM CT) and check-out (11:00 AM CT) (decisions)
- same-day cutoff 9:00 AM CT (decision)
- no saved cards; Link through the Payment Element (decision)
- CSP report-only first (decision)
- cancellation windows from 4:00 PM CT (72 h / 24 h) and normalized UTC timestamps with stored `check_in_at`/`check_out_at` (decisions)
- webhook events documented in `STRIPE_WEBHOOKS.md` at the start of Phase 3 (decision)
- DST: America/Chicago wall-clock cutoffs, always (decision); the higher refund at the exact cutoff (decision)
- disputes in the admin inbox, no email; Stripe objects carry booking ids in metadata (decisions)
- shadcn skills install (approved; Phase 0)
- email senders hardcoded (decision)
- Stripe `ui_mode: 'elements'`, `expires_at` 30 min to 24 h, `/checkout` React exports (verified)
- Better Auth `rateLimit.storage: 'database'` and magic-link `name` (verified)
- TanStack Start `createStart({ requestMiddleware, functionMiddleware })` (verified)

Resolved on 2026-11-08 (see 4.0): B8 (the four existing admin alert emails also create inbox items in Phase 4; emails stay), the contact form as an email-only server function, the inbox as Stripe/system notifications only, the cached unread badge, and the deferral of guest email messaging.

Resolved on 2026-11-08 (see 1.6): the admin check (D1 read for each admin call; browser cache 30 min), guest booking fields, admin room procedures, removing `ical.syncFeed`, rate limiting (D1 for Better Auth + Cloudflare binding middleware + Workers Logs; no KV), the `rateLimit` table columns and its self-cleanup (B1, part), and CSP reports to Workers Logs (B6).

Resolved on 2026-11-08 (see 3.00): dispute items resurface on every new Stripe event; Dashboard refunds send the app's guest and admin emails with the full booking details and create a `refund_issued` inbox item; B3 (holds created before the cutoff stay payable), B4 (agent supplies the event list, user updates the sandbox endpoint and checks Link), B5 (`HOLD_MINUTES` 35), B7 (admin cancel during a dispute defaults to no refund).

Still open:
- B1. Better Auth 1.7.18:
  - `additionalFields.phoneNumber` with `input: true` vs tRPC-only updates (2.1)
  - the captcha endpoint path for send-verification (2.3)
- ~~B9. Rate-limit namespace ids~~ Resolved in Phase 1: `20261` (auth), `20262` (API), `20263` (CSP reports), noted in `cloudflare.config.ts`. Check they are unused in the Cloudflare account before the first deploy.
