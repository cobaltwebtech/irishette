# Plan: admin bookings, 4 PM same-day cutoff, admin-only modifications

## Context

Guests can only book through the public flow (magic-link sign-in, hold, Stripe Checkout Elements, authorize then capture). The property needs three things:

1. **Admin-created bookings.** Staff take bookings by phone, with no magic-link step.
2. **A later same-day cutoff.** The cutoff moves from 9 AM to 4 PM CT, and admins may override it.
3. **Admin-only reservation changes.** Guests call 254-454-5558 to change a booking; staff move dates, extend, change room or release a room early, and the difference is charged or refunded.

Decisions already made with the user:

- **Card on file:** save the guest's card on the first payment (`setup_future_usage: 'off_session'`, consent line added). Price increases are charged off-session. A fresh card entry by the admin is the fallback.
- **Repricing:** reprice the whole new stay at current rates and rules. Charge or refund the difference from what the guest paid.
- **Branching:** one feature branch, phased commits, one PR. AGENTS.md says to ask before creating the branch or PR, so ask first. Commit order: Varlock tooling, 4 PM cutoff, card saving, admin booking page, modifications.
- **Varlock:** already implemented in the repo. The ask is to add `playwright.config.ts` and `vitest.config.ts` to the audit ignore list, and to add scripts that encrypt the local and production env files (Phase 0).

Production starts on a fresh DB (see memory), so there are no legacy bookings without a saved card.

## Answer: do we need `SetupIntent`?

**No.** Today the card is authorized with `capture_method: 'manual'`, captured right after the dates are claimed, and never saved. `createSession` sets `saved_payment_method_options.payment_method_save: 'disabled'` and no `setup_future_usage` (`src/lib/booking/checkout-service.ts:286-315`; asserted in `test/workers/checkout.test.ts:127-160`).

What Stripe's docs say:

- **Refunds need no saved card.** A refund (full or partial) goes against the original PaymentIntent.
- **Extra charges need a reusable card.**
  - `SetupIntent` is only for saving a card with no initial charge. Every booking already has a charge, so it is not needed.
  - The Checkout Session can save the card on that charge. Use `payment_intent_data.setup_future_usage: 'off_session'` with the existing `customer`. Confirm the exact parameters against `stripe docs /payments/checkout/save-during-payment` (`ui=elements`) when implementing.
- **Compliance:** Stripe requires terms covering how the saved card is used and the customer's recorded consent.
  - The booking form's policies checkbox needs a consent sentence.
  - The legal pages need matching text.
  - Store the consent timestamp.
- **Off-session limits:** a US card can still decline or ask for authentication. Fall back to fresh card entry by the admin. The saved method may be `link` rather than `card`. Charge a saved `card` or `link` off-session (Stripe supports reusing a saved Link method with `off_session`), and use the fallback otherwise.
- **Typing a guest's card into our own form is not a Stripe-recognized MOTO flow.** Stripe documents MOTO through Terminal readers, with access granted by Stripe support. Before relying on the admin card form, confirm with Stripe support that this use is acceptable for the account. It affects Radar and 3DS treatment.

Changes to the guest form: a consent sentence in `PaymentStep`, and the card is saved on the PaymentIntent. Nothing else changes for guests.

## Phase 0: Varlock tooling (audit ignores and encrypt scripts)

Varlock is already set up here: `.env.schema` (committed), generated `varlock.d.ts`, `varlock run --inject vars -- cf ...` scripts, `envDir: false` in `vite.config.ts`, `.env.local` and `.env.production` gitignored, and Varlock 1.24.0 installed. It works with Cloudflare Workers and TanStack Start through `cf` and `process.env`, so there is no build or runtime change. Two additions:

**1. Keep Varlock away from `playwright.config.ts` and `vitest.config.ts`.**

- Both files carry placeholder test values (`vitest.config.ts` has `sk_test_x`, `whsec_test` and the like; Playwright reads `E2E_*` and `BASE_URL`). The Varlock code scanner, `varlock audit`, reads `process.env` references in every file it scans. It would report these as keys missing from the schema.
- `varlock scan` only looks for the real resolved secret values, so these placeholders cannot trip it. No scan change is needed.
- Add `# @auditIgnorePaths(playwright.config.ts, vitest.config.ts)` to the header of `.env.schema`. The docs describe entries as directory names or paths, and one doc answer was ambiguous about whether single files work. So verify it works:
  - Run `varlock audit` before and after and confirm both files drop out of the report. The audit may prompt for Touch ID, so tell the user first.
  - If files are not honored, fall back to `varlock audit ./src ./scripts ./e2e ./test`. That skips the root configs, but it also skips `cloudflare.config.ts`, so run a one-off audit on that file separately.
- Do not change any `@public` or sensitive markings.

**2. Add Varlock scripts to `package.json`.**

Existing scripts stay: `env:check`, `env:scan`, `env:types`, `check:bundle`.

```json
"env:encrypt": "pnpm env:encrypt:local && pnpm env:encrypt:prod",
"env:encrypt:local": "varlock encrypt --file .env.local",
"env:encrypt:prod": "APP_ENV=production varlock encrypt --file .env.production",
"env:check:prod": "APP_ENV=production varlock load --agent",
"env:audit": "varlock audit",
"env:lock": "varlock lock",
"env:reveal": "varlock reveal"
```

- `APP_ENV=production` on the production scripts is required. `.env.production` is only loaded when `@currentEnv=$APP_ENV` is `production` (see `.env.schema`), so without it the file would not be in the graph.
- Encryption uses the local Secure Enclave key (Touch ID or password). Nothing needs a password manager. A file encrypted on this Mac can only be decrypted on this Mac, so production builds (`pnpm build:prod`, `pnpm run deploy`) must run from it.
- `varlock encrypt --file` only encrypts `@sensitive` plaintext values. In `.env.production`, `BETTER_AUTH_URL`, `STRIPE_PUBLISHABLE_KEY` and `VITE_TURNSTILE_PUBLIC_KEY` are `@public`, so they stay plain by design. Production secrets (`STRIPE_SECRET_KEY` and the others) are still set on the Worker with `wrangler secret put`. Varlock does not upload them.
- AGENTS.md rule: the user runs `encrypt`, `reveal` and `lock`, because they trigger Touch ID and handle plaintext. I only add the scripts. I will not run them or read any `.env*` file other than `.env.schema`.
- Docs to update: the AGENTS.md Commands block and the "Secrets and environment" section, plus the encrypt steps in `docs/GO_LIVE.md`.
- Verification: `pnpm env:types` leaves `varlock.d.ts` unchanged, and `pnpm check` passes. After the user runs the encrypt scripts, `pnpm env:check` and `pnpm env:check:prod` should load without errors, and `pnpm env:scan` should pass.

## Phase 1: 4 PM same-day cutoff

Small, independent.

- `src/lib/site.ts`: `SAME_DAY_CUTOFF_TIME = '16:00'`. The label, the `earliestCheckInDate` logic (`src/lib/booking/stay-times.ts:47`), `assertBookableDates` error text and the calendar copy all derive from it.
- Update tests:
  - `test/unit/stay-times.test.ts:60-74` and `test/unit/site.test.ts:24`.
  - `test/workers/booking-integrity.test.ts:68-106`, with boundaries at 15:59 and 16:00 CT instead of 08:59 and 09:00.
- Update docs: `docs/BOOKING_ARCHITECTURE.md` (lines 35-38, 315, 338-360, 529, 533, 561), `docs/STRIPE_PAYMENT_INTEGRATION.md:179`, `docs/TRPC_QUICK_REFERENCE.md` (180, 200, 451), and `AGENTS.md` (79, 120, 155).
- `cancellation-refund-policy` page: add a short late same-day paragraph in Phase 3.

## Phase 2: save the card and prepare checkout for admin use

**Schema.** Use `pnpm drizzle-kit generate`, never hand-edit `drizzle/`. Add the new tables to `src/db/schema-export.ts`.

- `bookings`:
  - `late_same_day` (integer boolean, default 0).
  - `created_by_admin_id` (text, FK `user`, set null).
  - `card_consent_at` (timestamp) and `card_consent_by` (`'guest'` or `'admin'`).
- `payment_transactions`: `stripe_payment_method_id`, `card_brand`, `card_last4`. These are populated in `recordConfirmation` (`checkout-service.ts:1038`) from `intent.payment_method`, which is already expanded in `completedSession`.
- New table `booking_modifications` (Phase 4).

**Checkout (`checkout-service.ts`, `createSession`).**

- Add `payment_intent_data.setup_future_usage: 'off_session'`. Keep `saved_payment_method_options.payment_method_save: 'disabled'`, since we show no saved-card picker.
- Add a `variant: 'guest' | 'admin'` option.
  - Admin uses `allowed_payment_method_types: ['card']`, which removes Link.
  - The client Payment Element gets `wallets: { applePay: 'never', googlePay: 'never' }`. Verify that option name in the Stripe Elements docs.
  - Admin `return_url` goes to `/admin/bookings/<publicId>`.
- Export `ensureStripeCustomer`. Add admin-allowed entry points that use `findAccessibleBooking(..., { allowAdmin: true })` (`bookings.ts:76`). Today `createCheckoutSession`, `refreshBooking` and `confirmCheckout` are owner-only.

**Guest form (`PaymentStep.tsx` / `PaymentForm`).** Add consent text to the policies checkbox and set `card_consent_at` and `card_consent_by = 'guest'` when the booking is confirmed.

**Legal text.** Update `src/routes/terms-of-service.tsx` (4.3), `cancellation-refund-policy.tsx` (Modifications section) and their `docs/*.md` sources. They are the hardcoded-phone exception. Cover:
- Card kept on file and used for approved changes (explicit consent).
- Changes are made by phone only.
- Differences are charged or refunded to that card.

## Phase 3: admin booking page

**Route.** `src/routes/_authed/_admin/admin/bookings/new.tsx`, giving `/admin/bookings/new`. Wrap it in `AdminLayout`. Add `{ title: 'New Booking', url: '/admin/bookings/new' }` to the Bookings group in `src/components/admin/AdminSidebar.tsx` (`navMainData`, around line 68).

**Flow (one page).**

1. **Room.** A select fed by `rooms.adminList`. Offer active rooms only.
2. **Dates.** A calendar fed by a new admin availability query.
   - Extract the date-picking core of `src/components/RoomAvailabilityCalendar.tsx` into a props-driven `AvailabilityCalendar`. Keep `isDisabled`, `unavailable`, `checkoutOnly` and `isStayAvailable`.
   - The core takes `unavailability`, `today`, `earliest` and `last` as data.
   - The guest component keeps its public `availability.getBySlug` query.
   - Add `availability.adminGetByRoom({ roomPublicId, excludeBookingId? })` as an `adminProcedure`. It wraps `loadUnavailability(...)` (`src/lib/booking/availability.ts:73`), which already supports `excludeBookingId`.
   - Admin earliest check-in is today. The window is the same as for guests (30 nights, 10 months).
   - Blocks, iCal events and holds appear as blocked, as on the room pages.
3. **Guest details.**
   - Email lookup, then name, phone, guest count, arrival window and special requests, plus internal notes.
   - Reuse `GuestDetailsFields` (`src/components/booking/GuestDetailsFields.tsx`) and `guestDetailsSchema` / `phoneNumberSchema`. Decouple the fields from the guest store hook. The fields component is store-coupled today, so refactor it to take values and handlers.
4. **Review.**
   - Price breakdown from a new `bookings.adminQuote` procedure. It calls `quoteStay` directly (`booking-service.ts:90`) and skips `assertBookableDates`.
   - Late same-day warning (below).
   - A "guest verbally consented to card on file" checkbox.
5. **Pay.** The card-only Payment Element, as in Phase 2. After payment, go to `/admin/bookings/<publicId>`.

**Server (new `adminProcedure`s in `bookings.ts`; no changes needed to `trpc-authz.test.ts`, because its sweep covers new admin procedures automatically).**

- `bookings.adminCreateBooking`, in order:
  1. Find or create the user. Lowercase the email and look it up. Reject a banned user. If none exists, call `auth.api.createUser({ body: { email, name, role: 'user' } })` (the `users.adminSetPassword` procedure shows how `auth.api.*` is called from tRPC), so `generateId`, `publicId` and the Stripe customer hook all run. Leave `emailVerified` false; a later magic-link sign-in verifies it. Set `phoneNumber` with a Drizzle update, because `input: false`. Fill `user.name` only if it is empty.
  2. Call a new `createAdminHold(deps, input, { userId, adminId })` in `booking-service.ts`. It shares the row-building code with `createHold`, which should be factored out. It skips the same-day cutoff but still checks the date window, maxGuests, the room being active and `checkAvailability`. It sets `createdByAdminId`, `lateSameDay` and `cardConsentAt/By`.
  3. Return `{ bookingId, publicId }`.
- `bookings.adminCreateCheckoutSession` and `bookings.adminConfirmCheckout` are thin admin variants of the existing ones.
- Everything after payment is the existing pipeline. `prepareCheckout`, `confirmBookingPayment`, `claimDates` and `captureAndRecord` re-check availability atomically before capture. Emails go out through `sendBookingConfirmedEmails`, which is keyed `booking-confirmed/<id>` and sends the guest and admin messages.

**Late same-day booking** (`checkIn === today CT` and `now >= SAME_DAY_CUTOFF_TIME`):

- **Server:**
  - Compute `lateSameDay` in `createAdminHold` from `earliestCheckInDate`. Require `acknowledgeLateBooking: true` from the admin.
  - The admin UI shows a warning banner and blocks the Continue button until the checkbox is ticked.
  - Past dates stay blocked.
- **Refunds:** `quoteBookingCancellation` (`booking-service.ts:423`) forces `refundPercent: 0` for `lateSameDay` bookings under the `policy` choice. The admin's explicit `full` choice still works.
- **Email:**
  - New react-email template `LateSameDayNoticeEmail` in `src/components/email/` (check `BookingNoticeEmail` for reuse). It says this was a late same-day booking and that no refunds apply.
  - Sent by a new `sendLateSameDayNoticeEmail`, deduped with key `late-same-day/<id>`. Call it from `sendBookingConfirmedEmails` when `booking.lateSameDay`.
  - The normal confirmation still goes out.

## Phase 4: modifications (admin only)

**Route nesting (true nesting under the booking route).**

- `bookings/$publicId.tsx` becomes a thin layout with the existing loader and an `<Outlet />`.
- The current page moves to `bookings/$publicId/index.tsx`.
- New `bookings/$publicId/modify.tsx`, giving `/admin/bookings/$publicId/modify`.
- The typed `BookingLink` in `src/components/booking/BookingsTable.tsx:28` should still resolve.
- Fallback if that gets messy: `bookings/$publicId_/modify.tsx`, which opts out of nesting and gives the same URL.
- Add a "Modify reservation" button to `AdminActionsCard` (`$publicId.tsx` around line 212). `src/routeTree.gen.ts` is generated.

**What admins can do** (all through one `bookings.adminModifyBooking`, preceded by a read-only `bookings.adminQuoteModification`):

- **Move dates or extend on the same room, or change room.**
  - Rule: new nights >= current nights (no shortening here). Admin may pick any available dates.
  - The new check-in must be today or later, unless it is unchanged, in which case an in-progress stay can be extended.
  - Availability uses `checkAvailability(..., { excludeBookingId })`. Admin calendar again via `adminGetByRoom({ excludeBookingId })`.
  - No same-day cutoff.
- **Release room early.** A separate action for guests who leave early.
  - It shortens `checkOutDate`, `checkOutAt` and `numberOfNights` to a chosen date >= today.
  - It does not touch any money field. There is no refund.
  - The original dates are kept in the modification log, and the admin stay card shows "Released early, originally X to Y".
  - The policy basis is the existing "Early Departure, no refund" text (`cancellation-refund-policy.tsx:193-200`).
- **Not allowed:** while `paymentStatus` is `authorized`, `refund_pending` or `refund_failed`, or on a cancelled or pending booking. Disputes: a refund on a disputed payment needs `confirmDisputeRefund`, as in `cancelConfirmed`.

**Pricing.**

- `quoteStay(db, newRoomId, newIn, newOut)` is the new quote (full reprice).
- `difference = new total - booking.totalAmount` in cents.
- The admin sees both breakdowns and the signed difference before confirming.
- `expectedDifferenceCents` is sent back to guard against drift, with a `CONFLICT` and a refreshed quote, as with `expectedRefundAmount` in `cancelBooking`.

**Money and booking update, in order (authorize, claim, capture; the same safety pattern as new bookings).**

1. **Increase:** authorize `difference` first.
   - Create a PaymentIntent with the saved card: `capture_method: 'manual'`, `customer`, `payment_method`, `off_session: true`, `confirm: true`. Metadata is `stripeBookingMetadata` plus `reason: 'modification'` and `modificationId`.
   - Find the card via `paymentIntents.retrieve(booking.stripePaymentIntentId).payment_method`, and refuse unless it is type `card`.
   - Decline or `requires_action`: no booking change, and the UI offers fresh card entry. That is a Checkout Session for the difference using the Phase 2 admin variant, handled in `checkout.session.completed` by metadata `kind: 'modification'`.
2. **Guarded update** on `bookings`, covering dates, room, nights, amounts, tax snapshot, `checkInAt`/`checkOutAt` and `updatedAt`.
   - `WHERE id = ? AND status = 'confirmed' AND payment_status IN ('paid','partially_refunded') AND updated_at = <expected>`, plus an overlap check against the NEW dates.
   - Gotcha: `noOverlapForBookingRow(now)` (`availability.ts:268`) reads the row's current dates. Add a parameterized variant, `noOverlapForStay(roomId, newIn, newOut, excludeId, now)`, in the style of `blockIsFree`.
   - `db.run` returns `meta.changes`. Zero changes means cancel the authorization and throw `CONFLICT`.
3. **Increase, after the claim:** capture with idempotency key `capture-modify/<modificationId>`. Insert a `payment_transactions` row for the new PaymentIntent. Record card details.
4. **Decrease, after the claim:** `refunds.create` against the original PaymentIntent, with idempotency key `refund-modify/<bookingId>/<modificationId>/<cents>` and `metadata.reason: 'modification'`. Record it with `recordAppRefund` (`checkout-service.ts:1067`).
   - Do NOT also increment `bookings.refundAmount`. `paidAmounts` (`booking-service.ts:410`) treats `totalAmount` as the amount paid, and `refundAmount` as the cancellation-refund bookkeeping.
   - A transient Stripe failure leaves the modification `refund_pending`. The `*/30` recovery cron (`scheduled-tasks.ts`) retries it. A permanent failure creates a `refund_failed` inbox item and an admin alert, as in `refundCancellation`.
5. Insert the `booking_modifications` row and send emails.

**New table `booking_modifications`:** `id`, `bookingId` (FK, cascade), `adminUserId`, `kind` (`move` | `extend` | `change_room` | `release_early`), previous and new room and dates, previous and new total, `differenceCents` (signed), `stripePaymentIntentId`, `stripeRefundId`, `status` (`applied` | `refund_pending` | `refund_failed`), `note`, `createdAt`. It is the audit trail and the source for the admin UI. There is no audit log today.

**Multi-payment refunds (required by increases).** A booking can now hold more than one PaymentIntent.

- `refundCancellation` (`booking-service.ts:699`) and `findCancellationRefund` refund only `booking.stripePaymentIntentId`. Refunding the full new total there would fail.
- Add `refundAcrossPayments(deps, booking, cents)`. It walks `payment_transactions` for the booking, newest first, refunding `amount - amountRefunded` on each until the total is covered. Idempotency keys include the PaymentIntent id.
- Update `retryCancellationRefund` and the cron to match.
- The Dashboard-refund webhook path already matches by charge id per transaction.

**Tax report.**

- `getTaxReport` joins each `payment_transactions` row to the current booking components and allocates in the booking's proportions (`docs/TAX_REPORTING.md`, "Refund allocation").
- For one room, fee and tax are fixed proportions of the total, so extra payments and modification refunds allocate exactly.
- Changing to a room with different fee or tax rates makes the allocation approximate.
- Update the "one payment per booking" assumption (`docs/TAX_REPORTING.md:104`). Add a test with multiple payments. Consider a per-transaction snapshot later.

**Admin detail page additions.**

- `adminGetBooking` also returns `paymentTransactions`, `paymentRefunds` (today no procedure exposes them) and `bookingModifications`.
- New "Payments and changes" card.
- The stay card shows modification notes.

**Guest messaging.**

- New email template `BookingModifiedEmail` to the guest. Add an admin inbox item for each modification (`src/lib/inbox`).
- Wording says that changes are made by phone only:
  - `ImportantInfoCard` (`BookingDetailCards.tsx:316`).
  - `BookingConfirmationEmail.tsx:142`.
  - Contact page.
  - `ReservationMarkup.tsx:60`: `modifyReservationUrl` currently points at the guest booking page, which has no modify action. Point it at the contact or phone instead.
- Use `CONTACT_PHONE` from `site.ts` everywhere except the legal pages.

## Tests

- **Unit:**
  - `stay-times` at 16:00.
  - A pure modification-difference and rules helper (no shortening, nights >= old, check-in not in the past unless unchanged).
  - A late-same-day flag helper.
- **Workers** (`test/workers/`, reuse `caller('admin')`, `insertBooking`, `mockEmail`, `useClock`, `settle`; the mocks in `mocks.ts` need `payment_intents.create` / `retrieve` and varying refund amounts added):
  - **Admin booking:**
    - Creates a user when the email is new, and reuses an existing user. A banned user is rejected.
    - Cutoff override sets `lateSameDay` and requires acknowledgement.
    - The late notice email and the normal confirmation both send.
    - Card-only Checkout params, `setup_future_usage`, and the card saved on `payment_transactions`.
    - A non-admin is rejected.
  - **Modifications:**
    - Increase with a saved card: authorize, claim, capture, and a new transaction row.
    - Decrease refund.
    - Room change.
    - Conflict at claim time cancels the authorization.
    - Decline falls back without changing the booking.
    - Refund retry through the cron.
    - Shortening is rejected, and early release does not touch money.
    - Cancel after an increase refunds across two PaymentIntents.
    - Tax report with multiple payments.
- Update `checkout.test.ts:127-160`, which asserts the old non-saving params.

## Docs to update

`BOOKING_ARCHITECTURE.md`, `STRIPE_PAYMENT_INTEGRATION.md`, `TRPC_QUICK_REFERENCE.md` (new procedures), `TAX_REPORTING.md`, `AGENTS.md` (cutoff, payments row), and the legal markdown sources.

## Verification

1. After each phase: `pnpm check:fix`, then `pnpm check`, `pnpm typecheck`, `pnpm test`.
2. After the schema phase: `pnpm drizzle-kit generate`, review the SQL, `pnpm db:migrate:local`. Remote migration only with explicit approval (`pnpm db:migrate:remote`).
3. Before finishing: `pnpm build` and `pnpm check:bundle`, then the Fallow review (`fallow doctor`, `fallow audit --base main`, `fallow architecture`). Add new server-only modules to the `server` zone in `.fallowrc.json`.
4. Manual end-to-end in `pnpm dev` with the Stripe CLI webhook forwarding and test cards (test mode only):
   - Admin books a room for a new email.
   - Admin books a same-day room after 4 PM CT, and a late notice arrives.
   - Extend a stay (increase charged to the saved test card), move to cheaper dates (partial refund), change room, release early.
   - Cancel after an increase, to check the split refund.
   - Check the Stripe dashboard payments and refunds.
   - Check the tax report.
5. Confirm with Stripe support that the admin-entered card form is acceptable (MOTO) before go-live. Note: production Stripe and `.env.production` values are the user's to manage.

## Out of scope / risks

- Dispute handling for modification payments reuses the existing dispute tracking; there is no new dispute logic.
- No per-night price snapshot is stored. The old price is the stored total, and the new price is today's rates. Moves that coincide with a rate change show that change in the difference, by design (full reprice).
- Link methods saved at checkout are charged off-session like cards; a decline uses the fallback.
- Admin-created bookings with no card (comp or pay at property) are not covered. Say so if wanted.
