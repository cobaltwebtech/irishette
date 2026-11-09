# Booking system

A guest picks dates on a room page, signs in, enters details (which creates a
35-minute **hold**), pays with the Stripe Payment Element backed by a Checkout
Session, and the booking is **confirmed** once the session is paid and the
dates are still free. All prices, availability and permissions are decided on the server; the
client store only drives the UI.

| Stage | Client | Server |
|---|---|---|
| Pick dates | `RoomAvailabilityCalendar` on `/rooms/<slug>` | `availability.getBySlug`, `rooms.calculatePricing` |
| Sign in | `AuthenticationStep` (`/booking`) | Better Auth magic link + Turnstile |
| Details | `BookingDetailsStep` | `bookings.calculateBooking`, `bookings.createBooking` (hold) |
| Pay | `PaymentStep` | `bookings.refreshBooking`, `bookings.createCheckoutSession`, then `bookings.confirmCheckout` (confirmation page) and the webhook |
| After | `/booking/confirmation/$publicId`, `/account/*` | `bookings.getBooking`, `getMyBookings`, `getCancellationQuote`, `cancelBooking` |

## Guest flow (client)

### Room page and calendar

`src/routes/rooms/rose-room.tsx` and `texas-room.tsx` (one file per room) load
the room with `rooms.get({ slug })` and call `bookingActions.initializeBooking`
when the stored draft is for another room.

`src/components/RoomAvailabilityCalendar.tsx`:

- Loads `availability.getBySlug` (default window: the property's today to 10
  months ahead). The response is date ranges only (`stays`, `events`,
  `blocks`), no ids, plus `today`, `earliestCheckIn` and `lastCheckOut` in
  property time: the calendar never uses the browser's clock. Check-in
  before `earliestCheckIn` (today until 9:00 AM CT, then tomorrow) is
  disabled, with a note under the calendar.
- Applies the same rules as the server, imported from `src/lib/date-range.ts`:
  `isCheckInDisabled`, `isCheckOutAllowed`, `isStayAvailable`. A day whose
  night is unavailable but whose previous night is free is shown as
  "Checkout Only".
- Enforces 1 to `MAX_NIGHTS` (30) nights and check-out by `lastCheckOut`
  (the same limits as the server, `src/lib/date-range.ts`).
- On a complete range, fetches `rooms.calculatePricing` (`staleTime: 0`) and
  reports the room subtotal and nights to the page, which writes the dates and
  a subtotal-only estimate into the store. "Book now" sets step `auth` and
  navigates to `/booking`.

### `/booking` (`src/routes/booking/index.tsx`)

Client-only render (waits for hydration because the store lives in
`localStorage`). Renders `BookingProgressSteps`, the current step and
`BookingSummaryCard`. Shows "No Active Booking" when the store has neither a
`bookingId` nor room + dates. It also refetches `rooms.get({ id })` if the
draft lacks the room name or `maxGuests`, keeps `bookings.calculateBooking`
in the store's `pricing` (zero fees or taxes are valid:
`isPricingComplete`), and accepts `?step=` (validated with Zod) to jump to a
step, clamped to the furthest step the draft allows
(`furthestAllowedStep`: payment needs a hold, details needs sign-in and
dates).

| Step | Component | What it does |
|---|---|---|
| `auth` | `src/components/booking/AuthenticationStep.tsx` | Magic link sign-in (`authClient.signIn.magicLink`, callback `/booking`) with a Turnstile token in `x-captcha-response`. Signed-in users move to `details` automatically. |
| `details` | `src/components/booking/BookingDetailsStep.tsx` | Name, email, phone, guests (1 to `maxGuests`), special requests, validated with the server's `guestDetailsSchema`. Updates the user's name/phone if changed, re-prices with `calculateBooking`, then calls `createBooking` and stores `bookingId` + `publicId`. |
| `payment` | `src/components/booking/PaymentStep.tsx` | On mount: `refreshBooking` (extends an expired hold if possible), then `createCheckoutSession`. Renders `CheckoutElementsProvider` + `<PaymentElement>` with the session's line items and total; requires the policies checkbox and `checkout.canConfirm`; `checkout.confirm({ redirect: 'if_required' })`, then navigates to the confirmation page with `?session_id=`. |

The store's steps are `auth`, `details` and `payment` (drafts saved with the
removed `dates` / `confirmation` steps restart at `auth`): dates are picked on
the room page and confirmation is its own route.

### Booking store (`src/stores/booking-store.ts`)

TanStack Store persisted to `localStorage` key `irishette-booking-draft`
(restored on load with defaults for missing fields). Hooks in
`src/stores/use-booking-store.ts` (`useBookingStore`, `useBookingActions`,
`useBookingSelector`); everything is re-exported from `src/stores/index.ts`.

State: room (`roomId`, `roomSlug`, `roomName`, `maxGuests`), dates,
`guestCount`, `pricing` (display only), `guestInfo`, `currentStep`,
`bookingId` (internal id, used by the payment procedures), `bookingPublicId`
(URLs), `error`, `isLoading`. `setGuestCount` and `setRoom` clamp guests to
`1..maxGuests`. `reset()` clears state and storage; it runs on the
confirmation page and after an automatic refund.

### Confirmation and account pages

All under the `_authed` pathless layout (`src/routes/_authed.tsx`), which
redirects anonymous users to `/auth/login`. Server procedures enforce access
regardless.

| Route | File | Notes |
|---|---|---|
| `/booking/confirmation/$publicId` | `src/routes/_authed/booking/confirmation.$publicId.tsx` | Loader `getBooking` via `orNotFound`; with `?session_id=` it calls `confirmCheckout` (Stripe's return URL lands here too) and refetches. Renders by status: confirmed, payment processing, payment not completed, cancelled. Resets the store on mount. |
| `/account` | `src/routes/_authed/account/index.tsx` | `getMyBookings({ limit: 50 })`. Confirmed stays not yet past (server `stayPhase`), plus "Awaiting Payment" (pending, including processing) and "Cancelled Bookings" sections. |
| `/account/past-bookings` | `src/routes/_authed/account/past-bookings.tsx` | Confirmed stays with `stayPhase: 'past'` (after 11:00 AM CT on the check-out date). |
| `/account/booking/$publicId` | `src/routes/_authed/account/booking.$publicId.tsx` | Details; "Resend Confirmation Email" for confirmed bookings only; "Contact Support" links to `/contact?booking=<confirmationId>`; `CancelBookingButton mode="guest"` while `canCancel` (before check-in); the cancellation windows with their CT cutoffs (`CancellationPolicySummary`). |

`src/components/booking/CancelBookingButton.tsx` is shared with the admin
booking page (`mode="admin"`, which adds the refund choice). It loads
`getCancellationQuote` when the dialog opens, shows the tier cutoffs in CT,
and sends the amount it showed (`expectedRefundAmount`); if a window passed in
the meantime the server answers `CONFLICT` and the dialog reloads the quote.
Status badges are shared (`StatusBadges.tsx`).

## Server

### tRPC procedures (`src/integrations/trpc/bookings.ts`)

Inputs are validated with the schemas in `src/lib/payment-validation.ts`.
`findAccessibleBooking` returns the caller's own booking (or any booking for
admins where allowed); anything else is `NOT_FOUND`, so existence never leaks.

| Procedure | Access | Calls |
|---|---|---|
| `calculateBooking` | public | `quoteStay` |
| `createBooking` | protected | `createHold` |
| `createCheckoutSession` | owner | `prepareCheckout`; also returns `publicId`, `STRIPE_PUBLISHABLE_KEY` |
| `refreshBooking` | owner | `refreshHold` |
| `confirmCheckout` | owner | `confirmBookingPayment` (return page fast path); returns the outcome status |
| `getBooking` | owner or admin | booking, room (without the iCal token), first payment transaction; admins also get the guest |
| `getMyBookings` | protected | own bookings with room, newest first |
| `getCancellationQuote` | owner or admin | `quoteBookingCancellation` |
| `cancelBooking` | owner | `cancelBooking` (`by: 'guest'`, `refund: 'policy'`) |
| `adminCancelBooking` | admin | `cancelBooking` (`by: 'admin'`, `refund: 'full' \| 'policy' \| 'none'`, `confirmDisputeRefund?`) |
| `resendConfirmationEmail` | owner or admin | confirmed bookings only |
| `adminListBookings`, `adminUpdateInternalNotes`, `adminGetMonthlyStats` | admin | direct queries |

Business logic lives in `src/lib/booking-service.ts` (pricing, holds,
cancellations), `src/lib/checkout-service.ts` (Checkout Sessions and
confirmation), `src/lib/refund-service.ts` and `src/lib/dispute-service.ts`
(webhooks). Services take
`ServiceDeps` (`src/lib/deps.ts`: `db`, `env`, `stripe`, `waitUntil`); the
tRPC context satisfies it, and the webhook and cron build one with
`createServiceDeps`. Emails run through `inBackground` (`waitUntil`, errors
logged, never thrown).

### Date rules (`src/lib/date-range.ts`)

Dates are `YYYY-MM-DD` strings compared as strings. A stay's nights are
`[checkIn, checkOut)`. The same functions run on the server and in the
calendar (`test/unit/date-range.test.ts` checks they agree).

| Rule | Condition |
|---|---|
| Stay vs booking or live hold | `in < b.out && out > b.in` (same-day turnover allowed) |
| Stay vs imported event (end exclusive) | `in < e.end && out > e.start` |
| Stay vs admin block (inclusive) | `in <= blk.end && out > blk.start` |
| Night `n` priced by a rule (inclusive) | `rule.start <= n && n <= rule.end` |
| Active pricing rules overlap (forbidden) | `a.start <= b.end && b.start <= a.end` |
| Block vs booking (admin check) | `blk.start < b.out && blk.end >= b.in` |

Example, block Jun 8-10: check-in Jun 10 rejected, Jun 11 allowed; stay
Jun 7-8 allowed; stay Jun 7-9 rejected.

"Today" on the server is the property date (`todayIn()`, `America/Chicago`,
`src/lib/timezone.ts`).

### Availability (`src/lib/availability.ts`)

- `loadUnavailability(db, roomId, from, to)` loads, for the range, bookings
  that hold dates (`holdsDatesCondition`: `confirmed`, `pending` with
  `expiresAt > now`, or `pending` with `paymentStatus = 'processing'` even
  after expiry), imported `external_events` and `room_blocked_periods`.
- `checkAvailability(db, roomId, checkIn, checkOut, { excludeBookingId })`
  runs `isStayAvailable` and returns typed conflicts. Guests only ever see
  conflict dates (`publicConflicts` in the booking service).
- `noOverlapForBookingRow(now)` is the same check as SQL `NOT EXISTS` clauses
  (confirmed bookings, live or processing holds **created earlier**, external
  events, blocks), used inside the guarded confirmation `UPDATE`.
- `findBlockConflicts` lists confirmed bookings, live holds and imported
  events an inclusive block would cover.

`availability.getBySlug` (`src/integrations/trpc/availability.ts`) is public:
active rooms only, default window today + 10 months, returns
`{ room, dateRange, unavailability }` with dates only.

### Pricing (`src/lib/pricing.ts`)

Pure. `priceStay(room, rules, checkIn, checkOut)`:

1. Each night is priced on its own by the active rule covering it, else the
   room `basePrice`. Rule types: `surcharge_rate` (`base * (1 + value)`),
   `fixed_amount` (`base + value`), `absolute_price` (`value`). If legacy data
   has overlapping active rules, the earliest `activatedAt` wins.
2. `baseAmount` = sum of nights. `feesAmount` = `baseAmount * serviceFeeRate`.
   `taxAmount` = state + city tax on `baseAmount`. All rounded to cents.
3. There is **no guest-count surcharge**; the guest count does not affect
   the price (`calculateBooking` accepts it but ignores it).

`quoteStay` (booking service) loads the room and its active rules and is used
by `rooms.calculatePricing` (calendar), `bookings.calculateBooking` and
`createHold`, so the calendar and checkout always agree. Prices sent by the
client in `createBooking` are ignored.

Rule management (`rooms.createPricingRule` / `updatePricingRule`) rejects an
overlapping active rule atomically (`INSERT ... WHERE NOT EXISTS`, `UPDATE ...
WHERE NOT EXISTS`) with `CONFLICT` and `data.conflict`, and sets
`activatedAt` on create-as-active and reactivation.

### Holds

`createHold` (`bookings.createBooking`):

1. Room must exist and be `active`; `guestCount <= room.maxGuests` (the schema
   caps it at 10, matching the `maxGuests` range); check-in not before the
   property's today.
2. `releaseOwnHolds`: deletes the user's other pending holds in the same room,
   expiring their open Checkout Sessions first (a hold whose session was paid
   or is processing is kept and confirmed).
3. `releaseExpiredHolds` (**priority rule**, below).
4. `checkAvailability`, else `CONFLICT` with the conflicting dates.
5. Inserts a `pending` booking with server prices, the active cancellation
   policy id, the guest's Stripe customer id, and
   `expiresAt = now + HOLD_MINUTES` (**35**).

**Booking priority: first hold wins while it is live.** A live hold blocks
other holds on the same dates. Creating the Checkout Session (or re-creating
it on refresh) extends the hold to `now + HOLD_MINUTES`, and the session
expires at the same moment. Once a hold has expired, another guest may hold
the dates: `releaseExpiredHolds` expires the old hold's session first, so it
can't be paid any more, and deletes the hold. If Stripe reports that session
was completed after all, the old booking is confirmed (or kept as processing)
and the new hold is refused with `CONFLICT`. So nobody pays and is then
refunded because of another guest; the guarded confirmation only has to guard
against confirmed bookings, earlier live holds, imported events and blocks
(an iCal import or admin block arriving during checkout still triggers the
automatic refund below).

`refreshHold` extends an **expired** hold by `HOLD_MINUTES` if the dates are
still free (otherwise `CONFLICT`); a live hold is left as is.

Expired holds are released by `scheduledBookingCleanup` (cron `5 8 * * *`,
`src/lib/scheduled-tasks.ts`) through `releaseExpiredHold` /
`closeHoldSession`: open sessions are expired, then the hold is deleted; a
paid session is confirmed instead; processing holds are skipped; Stripe
errors keep the hold for the next run. `checkout.session.expired` releases
the hold right away. Until then an expired hold simply stops blocking dates.

### Payment (Checkout Sessions)

Full details: `STRIPE_PAYMENT_INTEGRATION.md`.

`prepareCheckout` (`bookings.createCheckoutSession`):

1. Booking must be `pending` with a live hold.
2. `syncRoomFeeds(..., { trigger: 'checkout' })` imports the room's iCal
   feeds (best effort; see `ICAL_SYNC_README.md`), then `checkAvailability`
   again, excluding this booking.
3. Reuses the hold's open Checkout Session if the amount and expiry still
   match (and 10+ minutes are left); otherwise expires it and creates a new
   one (`ui_mode: 'elements'`, line items from our pricing, booking ids in
   metadata, no saved cards, `expires_at` = the extended hold expiry), saving
   `stripeSessionId` and the new `expiresAt` in one guarded write.

`confirmBookingPayment(deps, bookingId, sessionId)` is called by the return
page (`confirmCheckout`), the webhook, the cleanup cron and the priority rule.
It is idempotent across all of them:

1. Already `confirmed` with the same session -> `already_confirmed`.
   Already cancelled as `dates_unavailable` with the same session ->
   `refunded_conflict`. Any other non-pending state -> `BAD_REQUEST`.
2. Retrieves the session (with its PaymentIntent) and checks
   `metadata.bookingId`, `client_reference_id`, amount, currency and mode.
   Complete but unpaid (a delayed payment method) -> `paymentStatus:
   'processing'` (`processing`).
3. One guarded `UPDATE ... WHERE status = 'pending' AND
   noOverlapForBookingRow(now)` sets `confirmed` / `paid`, `confirmedAt`, the
   session, PaymentIntent and customer ids. On success: inserts a
   `payment_transactions` row (with the charge id) and sends the confirmation
   emails (`confirmed`).
4. If nothing changed and it was not confirmed by a concurrent caller,
   `refundUnavailableBooking` refunds in full (idempotency key
   `refund-unavailable/<id>`), sets `cancelled` / `refunded`,
   `cancelledBy: 'system'`, `cancellationReason: 'dates_unavailable'`, emails
   the guest and admins plus an admin alert, and adds a `refund_auto` inbox
   item (`ADMIN_INBOX.md`) (`refunded_conflict`).

Confirmation does not re-check `expiresAt` or the same-day cutoff: a session
can only be paid while its hold is live (they expire together), and a
delayed payment keeps its dates as `processing`.

### Stripe webhook (`src/lib/stripe-webhook.ts`)

`POST /api/stripe/webhook` (route `src/routes/api/stripe.$.ts`; other paths
404). Requires JSON and a valid `stripe-signature` against
`STRIPE_TRPC_WEBHOOK_SECRET` (400 otherwise, without details). Better Auth's
Stripe plugin has its own endpoint under `/api/auth`. The event list and what
each does: `STRIPE_WEBHOOKS.md`.

| Events | Handling |
|---|---|
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | `confirmBookingPayment` (paid) or mark `processing` (unpaid). Unknown sessions and permanent `TRPCError`s are acknowledged (200); other errors return 500 so Stripe retries. |
| `checkout.session.async_payment_failed` | Cancels the hold (`payment_failed`) and emails the guest. |
| `checkout.session.expired` | Deletes the hold if it is still pending and not processing. |
| `refund.created`, `refund.updated`, `refund.failed` | `handleRefundEvent` (`refund-service.ts`): Dashboard refunds cancel (full) or update (partial) the booking, email guest + admins and add a `refund_issued` item; app refunds only sync; failures alert the admins. |
| `charge.refunded` | Totals only (`refundAmount`, `paymentStatus`). |
| `charge.dispute.*` | `handleDisputeEvent` (`dispute-service.ts`): store, link, `payment_dispute` inbox item; no email. |
| `payment_intent.payment_failed` | Logged; the hold stays until it expires. |

Logs carry Stripe ids and confirmation ids only.

### Times (check-in, check-out, same-day cutoff)

All date/time rules use **America/Chicago wall-clock time**, whatever the
server's or browser's time zone. The times are constants in `src/lib/site.ts`:
`CHECK_IN_TIME` 16:00, `CHECK_OUT_TIME` 11:00, `SAME_DAY_CUTOFF_TIME` 09:00
(labels `CHECK_IN_TIME_LABEL` etc. are what pages and emails print; the legal
pages are the one exception). `src/lib/stay-times.ts` turns them into
instants: `checkInAt(date)`, `checkOutAt(date)`, `localCutoff(date, time,
hoursBefore)`, `earliestCheckInDate(now)` and `stayPhase`.

**Stored instants:** every instant in D1 is UTC Unix seconds
(`integer(..., { mode: 'timestamp' })`); stay dates are property-local
`YYYY-MM-DD`; times of day exist only as the constants. Each booking stores
`check_in_at` (check-in date at 4:00 PM CT) and `check_out_at` (check-out date
at 11:00 AM CT), written by `createHold`, indexed with `status`. Cancellation,
refund and stay-phase checks compare these instants; the account and admin
lists filter by them (`phase: 'upcoming' | 'current' | 'past'`).

**Booking limits** (`assertBookableDates`, used by `createHold` and
`calculateBooking`): check-in not before `earliestCheckInDate(now)` (today
until 9:00 AM CT, else tomorrow: "Same-day bookings close at 9:00 AM CT"), at
most `MAX_NIGHTS` (30) nights, check-out within `BOOKING_WINDOW_MONTHS` (10)
months. A hold created in time stays payable until it expires (B3).

The iCal export stays all-day (date-only) events.

### Cancellations and refunds

Policy data and the quote are pure (`src/lib/cancellation-policy.ts`):

- A policy is a name and tiers `{ minHoursBefore, refundPercent }`.
  `DEFAULT_CANCELLATION_POLICY`: 72 h+ 100%, 24 h+ 50%, less 0%. There is no
  per-policy check-in time or time zone any more: windows always count back
  from check-in at **4:00 PM CT**.
- **Cutoffs are wall-clock:** a tier's cutoff is `minHoursBefore` hours before
  4:00 PM CT on the check-in date, whole days counted as calendar days
  (`localCutoff`): "72 hours" is 4:00 PM CT three days before, also across a
  DST change (that day has 71 or 73 elapsed hours); 36 h is 4:00 AM CT a day
  and a half before. Each local cutoff becomes a UTC instant with the Chicago
  offset for that date.
- `quoteCancellation` picks the first tier (most notice first) with
  `now <= cutoff`, so at exactly a cutoff the higher refund applies.
  `canCancel` is false from `check_in_at` on. The refund is the tier percent of
  the **booking total** (taxes and fees included), capped at what is still
  paid (`total - refundAmount`, e.g. after a partial refund in Stripe). The
  quote returns every tier's cutoff (`refundCutoffs`); the UI formats them in
  CT (`formatInstantCT`, "Tue, Jun 7, 2030, 4:00 PM CT").

Storage (`src/lib/cancellation-policy-store.ts`, tables in
`src/db/policy-schema.ts`): `saveCancellationPolicy` adds a new active
version and deactivates the old one; `getActiveCancellationPolicy` is what new
holds record in `bookings.cancellation_policy_id`;
`getBookingCancellationPolicy` loads the version a booking was made under
(default if null). Admin UI: `/admin/cancellation-policy` via the `policies`
router (`src/integrations/trpc/policies.ts`); it explains the fixed 4:00 PM CT
reference as read-only text.

`cancelBooking` (booking service):

| Booking | Behaviour |
|---|---|
| `pending` (hold) | Expires the open Checkout Session (`CONFLICT` if it was paid or the payment is processing), sets `cancelled`, refund 0, no email. |
| `confirmed`, guest | Policy refund; rejected from check-in on. |
| `confirmed`, admin | `full` (what is still paid), `policy`, or `none`; allowed after check-in. |
| `confirmed`, open dispute | Guests: `CONFLICT` ("contact us"). Admins: the dialog defaults to no refund; a refund needs `confirmDisputeRefund` (Stripe warns it can credit the guest twice). |
| Quote drift | If `expectedRefundAmount` (what the dialog showed) differs from the server's amount (a window passed), `CONFLICT` with the new amount; nothing changes. |

**Save first, then refund** (`cancelConfirmed`, plan 02 3.7):

1. One guarded update (`status = 'confirmed'`) sets `cancelled`,
   `paymentStatus: 'refund_pending'` (when a refund is due),
   `cancelledBy`, `cancellationReason`, and the applied tier
   (`cancellation_refund_percent`, `cancellation_cutoff_at`). The dates are
   free from here.
2. The refund: `stripe.refunds.create` with metadata `stripeBookingMetadata` +
   `reason: 'cancellation'`, idempotency key
   `refund-cancel/<bookingId>/<amountCents>`, recorded in `payment_refunds`
   (source `app`, so the refund webhooks send no second email).
3. `refunded` / `partially_refunded` with the new `refundAmount` (total
   refunded so far) and `payment_transactions` updated. If Stripe fails: the
   booking stays cancelled with `refund_failed`, the admins get an alert email
   and a `refund_failed` notification (dedupe `refund_failed:cancel:<id>`),
   and the guest sees "refund pending".

Cancellation emails go to the guest and admins after that.

### Emails (`src/lib/email-service.ts`)

Resend with react-email templates in `src/components/email/`. Confirmation,
cancellation and alert sends pass a Resend idempotency key, so a repeated
confirm or retry does not send twice. Logs never include addresses.

| Function | When | Recipients |
|---|---|---|
| `sendBookingConfirmedEmails` | Booking confirmed (key `booking-confirmed/<id>`) | Guest + all admins |
| `sendBookingConfirmationEmail` | "Resend" button | Guest |
| `sendCancellationEmails` | Confirmed booking cancelled, or auto-refund (key `booking-cancelled/<id>`) | Guest + admins |
| `sendAdminAlert` | Auto-refund, failed refund, iCal problems (each also creates an admin inbox item, `ADMIN_INBOX.md`) | Admins |
| `sendContactNotification` | Contact form (`CONTACT_FORM.md`); `replyTo` = the guest | `CONTACT_EMAIL` |

Admin addresses come from `getAdminEmails` (`src/lib/admin-query.ts`).

### Admin blocks

Managed in **Admin -> Property -> (room)**
(`src/components/admin/RoomBlockingManagement.tsx`) through
`rooms.getBlockedPeriods`, `createBlockedPeriod`, `updateBlockedPeriod`,
`deleteBlockedPeriod` (`src/integrations/trpc/rooms.ts`). Block dates are
inclusive. `assertBlockAllowed` rejects a create or a date change with
`CONFLICT` and `data.conflicts` (`{ publicId, confirmationId, source,
checkIn, checkOut, status }`, listed in the admin dialog) when the block would
cover a confirmed booking, a live or processing hold or an imported event, or
overlap another block. Expired holds do not count. The insert (and a date
change) is then **one guarded statement** whose `WHERE` repeats the check
(`blockIsFree` in `availability.ts`), so a booking or import arriving in
between makes it `CONFLICT` instead of a double booking. Blocks are exported
in the iCal feed.

## IDs

| Id | Format | Used for |
|---|---|---|
| `id` | UUIDv7 (`newId`, `src/lib/ids.ts`), time-ordered TEXT primary key on every table | Internal references, payment procedures (`bookingId`), Stripe metadata |
| `publicId` | 16 chars `[0-9a-z]` (`newPublicId`), unique; validated by `publicIdSchema` | URLs (`/booking/confirmation/$publicId`, `/account/booking/$publicId`, `/admin/bookings/$publicId`) and `getBooking` / cancel inputs |
| `confirmationId` | 6 chars from `A-Z` (no I, O) and `0-9` (`generateConfirmationId` in `booking-service.ts`), unique | Shown to guests, in email subjects and in logs |

Tables in `src/db/booking-schema.ts`: `bookings`, `payment_transactions` (one
per paid booking: Checkout Session, PaymentIntent and charge ids, amount
refunded), `payment_refunds` (every refund, app or Dashboard) and
`payment_disputes`. On `bookings`, `stripe_session_id` is the hold's current
Checkout Session (used since Phase 3) and `stripe_payment_intent_id` is set on
confirmation; `discount_amount` is reserved for discounts and not set yet.
Statuses are shared enums (`src/lib/booking-status.ts`, Drizzle `text` enums):
booking `status` is `pending` / `confirmed` / `cancelled` (stored; there is no
`completed`); `paymentStatus` (also `payment_transactions.status`) is
`pending` / `processing` / `paid` / `partially_refunded` / `refunded` /
`refund_pending` / `refund_failed` (a failed card payment leaves the hold
`pending` until it expires). The stay's timing is derived, not stored:
`stayPhase` (`upcoming` before 4:00 PM CT on the check-in date, `in_stay`
until 11:00 AM CT on the check-out date, then `past`) from the stored
`check_in_at` / `check_out_at`. Guest responses also carry `canCancel` and
`cancelUntil` (check-in). Amounts are dollars.

## Tests

| File | Covers |
|---|---|
| `test/unit/date-range.test.ts`, `pricing.test.ts` | Overlap rules (calendar vs server), per-night pricing, no guest surcharge |
| `test/unit/cancellation-policy.test.ts` | Tier cutoffs (at, 1 s before/after each cutoff, after check-in), DST check-ins (71/73 h), a 36 h tier, partial-refund cap, `TZ=Asia/Tokyo`, policy schema |
| `test/unit/stay-times.test.ts` | `checkInAt`/`checkOutAt` (CDT/CST, DST days), `localCutoff`, the 9:00 AM CT same-day cutoff, `stayPhase` edges, `addMonths`, `isPricingComplete` |
| `test/unit/booking-store.test.ts` | Store steps, `furthestAllowedStep`, old drafts, guest clamping, persistence, reset |
| `test/unit/ids.test.ts`, `validation.test.ts` | Id formats, booking/payment input schemas |
| `test/workers/bookings.test.ts` | Overlaps, holds, pricing parity, ownership, cancellation and refunds |
| `test/workers/booking-integrity.test.ts` | Stored check-in/out instants, booking limits, the same-day cutoff, applied tier, quote drift, partial refunds, save-then-refund with a failing refund, stay phase |
| `test/workers/checkout.test.ts` | Session parameters, reuse/replacement, confirmation checks, processing, auto-refund on conflict, idempotency, priority rule |
| `test/workers/stripe-webhook.test.ts` | Signature, `checkout.session.*`, refunds, disputes, log hygiene |
| `test/workers/blocks.test.ts` | Block conflicts and booking around blocks |
| `test/workers/pricing-rules.test.ts` | Rule overlap (incl. concurrent creates), per-night pricing |
| `test/workers/rooms-max-guests.test.ts` | `maxGuests` admin update and enforcement |
| `test/workers/scheduled.test.ts` | Hold cleanup cron, cron map |
| `test/workers/trpc-authz.test.ts`, `trpc-public-leaks.test.ts` | Access levels, public outputs (no ids) |
| `e2e/booking.spec.ts` | Books the Rose Room with a test card (Playwright) |

Run with `pnpm test` (or `pnpm test:unit`, `pnpm test:workers`).

## File map

| File | Role |
|---|---|
| `src/routes/rooms/*.tsx`, `src/components/RoomAvailabilityCalendar.tsx` | Room pages and date picker |
| `src/routes/booking/index.tsx`, `src/components/booking/*` | Booking flow, steps, summary, cancel dialog |
| `src/stores/booking-store.ts`, `use-booking-store.ts` | Client draft (TanStack Store + `localStorage`) |
| `src/routes/_authed/booking/`, `src/routes/_authed/account/` | Confirmation and guest account pages |
| `src/integrations/trpc/bookings.ts`, `availability.ts` | Booking procedures, public calendar data |
| `src/lib/booking-service.ts` | Pricing, holds (priority rule), cancellation |
| `src/lib/checkout-service.ts` | Checkout Sessions, confirmation, automatic refund |
| `src/lib/refund-service.ts`, `dispute-service.ts` | Refund and dispute webhooks |
| `src/lib/availability.ts` | Availability queries and SQL guard |
| `src/lib/date-range.ts` | Date rules (shared with the client) |
| `src/lib/pricing.ts` | Per-night pricing |
| `src/lib/stay-times.ts`, `src/lib/site.ts` | Check-in/out instants, same-day cutoff, stay phase; the time constants |
| `src/lib/booking-status.ts` | Booking and payment status enums |
| `src/lib/cancellation-policy.ts`, `cancellation-policy-store.ts` | Refund policy and versions |
| `src/lib/stripe-webhook.ts` | Stripe webhook handler |
| `src/lib/email-service.ts` | Booking and admin emails |
| `src/lib/scheduled-tasks.ts` | Expired hold cleanup cron |
| `src/lib/payment-validation.ts` | Booking/payment Zod schemas |
