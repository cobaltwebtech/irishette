# Booking system

A guest picks dates on a room page, signs in, enters details (which creates a
30-minute **hold**), pays with the Stripe Payment Element, and the booking is
**confirmed** once the PaymentIntent has succeeded and the dates are still
free. All prices, availability and permissions are decided on the server; the
client store only drives the UI.

| Stage | Client | Server |
|---|---|---|
| Pick dates | `RoomAvailabilityCalendar` on `/rooms/<slug>` | `availability.getBySlug`, `rooms.calculatePricing` |
| Sign in | `AuthenticationStep` (`/booking`) | Better Auth magic link + Turnstile |
| Details | `BookingDetailsStep` | `bookings.calculateBooking`, `bookings.createBooking` (hold) |
| Pay | `PaymentStep` | `bookings.refreshBooking`, `bookings.createPaymentIntent`, `bookings.confirmPayment`, webhook |
| After | `/booking/confirmation/$publicId`, `/account/*` | `bookings.getBooking`, `getMyBookings`, `getCancellationQuote`, `cancelBooking` |

## Guest flow (client)

### Room page and calendar

`src/routes/rooms/rose-room.tsx` and `texas-room.tsx` (one file per room) load
the room with `rooms.get({ slug })` and call `bookingActions.initializeBooking`
when the stored draft is for another room.

`src/components/RoomAvailabilityCalendar.tsx`:

- Loads `availability.getBySlug` from today (browser date) to 10 months ahead.
  The response is date ranges only (`stays`, `events`, `blocks`), no ids.
- Applies the same rules as the server, imported from `src/lib/date-range.ts`:
  `isCheckInDisabled`, `isCheckOutAllowed`, `isStayAvailable`. A day whose
  night is unavailable but whose previous night is free is shown as
  "Checkout Only".
- Enforces 1-30 nights (props `minNights` / `maxNights`).
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
in the store's `pricing`, and accepts `?step=` to jump to a step.

| Step | Component | What it does |
|---|---|---|
| `auth` | `src/components/booking/AuthenticationStep.tsx` | Magic link sign-in (`authClient.signIn.magicLink`, callback `/booking`) with a Turnstile token in `x-captcha-response`. Signed-in users move to `details` automatically. |
| `details` | `src/components/booking/BookingDetailsStep.tsx` | Name, email, phone, guests (1 to `maxGuests`), special requests. Updates the user's name/phone if changed, re-prices with `calculateBooking`, then calls `createBooking` and stores `bookingId` + `publicId`. |
| `payment` | `src/components/booking/PaymentStep.tsx` | On mount: `refreshBooking` (extends an expired hold if possible), then `createPaymentIntent`. Renders `<PaymentElement>`; requires the policies checkbox; `stripe.confirmPayment({ redirect: 'if_required' })`; on `succeeded` calls `confirmPayment` and navigates to the confirmation page. A `CONFLICT` from `confirmPayment` (auto-refund) shows the server message and resets the store. |

The `dates` and `confirmation` store steps are not rendered by `/booking`:
dates are picked on the room page and confirmation is its own route.

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
| `/booking/confirmation/$publicId` | `src/routes/_authed/booking/confirmation.$publicId.tsx` | Loader `getBooking` via `orNotFound`; resets the store on mount. |
| `/account` | `src/routes/_authed/account/index.tsx` | `getMyBookings({ limit: 50 })`, shows confirmed bookings with check-out today or later. |
| `/account/past-bookings` | `src/routes/_authed/account/past-bookings.tsx` | Confirmed bookings with check-out before today. |
| `/account/booking/$publicId` | `src/routes/_authed/account/booking.$publicId.tsx` | Details, "Resend Confirmation Email", `CancelBookingButton mode="guest"` unless cancelled. |

`src/components/booking/CancelBookingButton.tsx` is shared with the admin
booking page (`mode="admin"`, which adds the refund choice). It loads
`getCancellationQuote` when the dialog opens.

## Server

### tRPC procedures (`src/integrations/trpc/bookings.ts`)

Inputs are validated with the schemas in `src/lib/payment-validation.ts`.
`findAccessibleBooking` returns the caller's own booking (or any booking for
admins where allowed); anything else is `NOT_FOUND`, so existence never leaks.

| Procedure | Access | Calls |
|---|---|---|
| `calculateBooking` | public | `quoteStay` |
| `createBooking` | protected | `createHold` |
| `createPaymentIntent` | owner | `preparePayment`; also returns `STRIPE_PUBLISHABLE_KEY` |
| `refreshBooking` | owner | `refreshHold` |
| `confirmPayment` | owner | `confirmBookingPayment`; `refunded_conflict` becomes `CONFLICT` |
| `getBooking` | owner or admin | booking, room (without the iCal token), first payment transaction; admins also get the guest |
| `getMyBookings` | protected | own bookings with room, newest first |
| `getCancellationQuote` | owner or admin | `quoteBookingCancellation` |
| `cancelBooking` | owner | `cancelBooking` (`by: 'guest'`, `refund: 'policy'`) |
| `adminCancelBooking` | admin | `cancelBooking` (`by: 'admin'`, `refund: 'full' \| 'policy' \| 'none'`) |
| `resendConfirmationEmail` | owner or admin | confirmed bookings only |
| `adminListBookings`, `adminUpdateInternalNotes`, `adminGetMonthlyStats` | admin | direct queries |

Business logic lives in `src/lib/booking-service.ts`. Services take
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
  that hold dates (`holdsDatesCondition`: `confirmed`, or `pending` with
  `expiresAt > now`), imported `external_events` and `room_blocked_periods`.
- `checkAvailability(db, roomId, checkIn, checkOut, { excludeBookingId })`
  runs `isStayAvailable` and returns typed conflicts. Guests only ever see
  conflict dates (`publicConflicts` in the booking service).
- `noOverlapForBookingRow` is the same check as SQL `NOT EXISTS` clauses
  (confirmed bookings, external events, blocks; **not** pending holds), used
  inside the guarded confirmation `UPDATE`.
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
2. `releaseOwnHolds`: deletes the user's other pending holds in the same room
   (cancelling their open PaymentIntents; holds whose intent is `succeeded` or
   `processing` are kept).
3. `checkAvailability`, else `CONFLICT` with the conflicting dates.
4. Inserts a `pending` booking with server prices, the active cancellation
   policy id, the guest's Stripe customer id, and
   `expiresAt = now + HOLD_MINUTES` (30).

A live hold blocks other guests in the calendar and at booking time.
`refreshHold` extends an **expired** hold by 30 minutes if the dates are
still free (otherwise `CONFLICT`); a live hold is left as is.

Expired holds are removed by `scheduledBookingCleanup` (cron `5 8 * * *`,
`src/lib/scheduled-tasks.ts`): no intent -> delete; intent `succeeded` ->
`confirmBookingPayment` (kept if that fails); `processing` -> kept; other
open intents are cancelled, then the hold is deleted; Stripe errors keep the
hold for the next run. Until then an expired hold simply stops blocking dates.

### Payment

`preparePayment` (`bookings.createPaymentIntent`):

1. Booking must be `pending` with a live hold.
2. `syncRoomFeeds(..., { trigger: 'checkout' })` imports the room's iCal
   feeds (best effort; see `ICAL_SYNC_README.md`), then `checkAvailability`
   again, excluding this booking.
3. Reuses the booking's existing intent if it is still payable
   (`requires_payment_method`, `requires_confirmation`, `requires_action`) and
   the amount matches; otherwise creates one: amount in cents from
   `totalAmount`, `usd`, the guest's Stripe customer (`ensureStripeCustomer`,
   idempotency key `customer/<userId>`), metadata `bookingId`, `userId`,
   `roomId`, `type: 'booking'`, automatic payment methods,
   `setup_future_usage: 'off_session'`.

The intent is confirmed and charged immediately in the browser (no manual
capture).

`confirmBookingPayment(deps, bookingId, paymentIntentId)` is called by the
front-end (`confirmPayment`), the webhook and the cleanup cron. It is
idempotent across all three:

1. Already `confirmed` with the same intent -> `already_confirmed`.
   Already cancelled as `dates_unavailable` with the same intent ->
   `refunded_conflict`. Any other non-pending state -> `BAD_REQUEST`.
2. `verifyIntent`: status `succeeded`, and `metadata.bookingId`,
   `metadata.userId`, amount and currency match the booking.
3. One guarded `UPDATE ... WHERE status = 'pending' AND noOverlapForBookingRow`
   sets `confirmed` / `paid`, `confirmedAt`, the intent and customer ids. On
   success: inserts a `payment_transactions` row and sends the confirmation
   emails (`confirmed`).
4. If nothing changed and it was not confirmed by a concurrent caller,
   `refundUnavailableBooking` refunds the full intent (idempotency key
   `refund-unavailable/<id>`), sets `cancelled` / `refunded`,
   `cancelledBy: 'system'`, `cancellationReason: 'dates_unavailable'`, and
   emails the guest and admins plus an admin alert (`refunded_conflict`).

Confirmation does not check `expiresAt` and ignores other pending holds: a
guest who pays after their hold expired is still confirmed if no confirmed
booking, imported event or block took the dates, and when two guests pay for
the same dates the first confirmation wins and the other is refunded.

### Stripe webhook (`src/lib/stripe-webhook.ts`)

`POST /api/stripe/webhook` (route `src/routes/api/stripe.$.ts`; other paths
404). Requires JSON and a valid `stripe-signature` against
`STRIPE_TRPC_WEBHOOK_SECRET` (400 otherwise, without details). Better Auth's
Stripe plugin has its own endpoint under `/api/auth`.

| Event | Handling |
|---|---|
| `payment_intent.succeeded` | Finds the booking by `metadata.bookingId` or intent id, then `confirmBookingPayment`. Unknown intents and permanent `TRPCError`s are acknowledged (200); other errors return 500 so Stripe retries. |
| `payment_intent.payment_failed` | Logged; the hold stays until it expires. |
| `charge.refunded` | Sets `paymentStatus` (`refunded` / `partially_refunded`) and `refundAmount` from the charge, including refunds made in the dashboard. |
| `refund.failed`, `refund.updated` (status `failed`) | Logs and sends an admin alert. |

Logs carry Stripe ids and confirmation ids only.

### Cancellations and refunds

Policy data and the quote are pure (`src/lib/cancellation-policy.ts`):

- A policy is `checkInTime` (`HH:MM`), `timezone` and tiers
  `{ minHoursBefore, refundPercent }`. `DEFAULT_CANCELLATION_POLICY`: 16:00
  `America/Chicago`; 72 h+ 100%, 24 h+ 50%, less 0%.
- `quoteCancellation` measures hours from now to check-in time on the
  check-in date (`zonedTimeToUtc`); `canCancel` is false once that time has
  passed. The refund is `refundPercent` of the amount paid, rounded to cents.

Storage (`src/lib/cancellation-policy-store.ts`, tables in
`src/db/policy-schema.ts`): `saveCancellationPolicy` adds a new active
version and deactivates the old one; `getActiveCancellationPolicy` is what new
holds record in `bookings.cancellation_policy_id`;
`getBookingCancellationPolicy` loads the version a booking was made under
(default if null). Admin UI: `/admin/cancellation-policy` via the `policies`
router (`src/integrations/trpc/policies.ts`).

`cancelBooking` (booking service):

| Booking | Behaviour |
|---|---|
| `pending` (hold) | Cancels the open PaymentIntent (`CONFLICT` if it is `succeeded`/`processing`), sets `cancelled`, refund 0, no email. |
| `confirmed`, guest | Policy refund; rejected after check-in time. |
| `confirmed`, admin | `full` (amount paid), `policy`, or `none`; allowed after check-in. |

For confirmed bookings, a positive refund goes through `stripe.refunds.create`
(idempotency key `refund-cancel/<id>`), then a guarded update sets
`cancelled`, `paymentStatus` (`refunded` or `partially_refunded`, unchanged if
nothing is refunded), `cancelledBy`, `cancellationReason`, `refundAmount`,
`stripeRefundId`, updates `payment_transactions`, and emails the guest and
admins. Cancelled bookings stop blocking dates immediately.

### Emails (`src/lib/email-service.ts`)

Resend with react-email templates in `src/components/email/`. Confirmation,
cancellation and alert sends pass a Resend idempotency key, so a repeated
confirm or retry does not send twice. Logs never include addresses.

| Function | When | Recipients |
|---|---|---|
| `sendBookingConfirmedEmails` | Booking confirmed (key `booking-confirmed/<id>`) | Guest + all admins |
| `sendBookingConfirmationEmail` | "Resend" button | Guest |
| `sendCancellationEmails` | Confirmed booking cancelled, or auto-refund (key `booking-cancelled/<id>`) | Guest + admins |
| `sendAdminAlert` | Auto-refund, failed refund, iCal problems | Admins |

Admin addresses come from `getAdminEmails` (`src/lib/admin-query.ts`).

### Admin blocks

Managed in **Admin -> Property -> (room)**
(`src/components/admin/RoomBlockingManagement.tsx`) through
`rooms.getBlockedPeriods`, `createBlockedPeriod`, `updateBlockedPeriod`,
`deleteBlockedPeriod` (`src/integrations/trpc/rooms.ts`). Block dates are
inclusive. `assertBlockAllowed` rejects a create or a date change with
`CONFLICT` and `data.conflicts` (`{ publicId, confirmationId, source,
checkIn, checkOut, status }`, listed in the admin dialog) when the block would
cover a confirmed booking, a live hold or an imported event, or overlap
another block. Expired holds do not count. Blocks are exported in the iCal
feed.

## IDs

| Id | Format | Used for |
|---|---|---|
| `id` | UUIDv7 (`newId`, `src/lib/ids.ts`), time-ordered TEXT primary key on every table | Internal references, payment procedures (`bookingId`), Stripe metadata |
| `publicId` | 16 chars `[0-9a-z]` (`newPublicId`), unique; validated by `publicIdSchema` | URLs (`/booking/confirmation/$publicId`, `/account/booking/$publicId`, `/admin/bookings/$publicId`) and `getBooking` / cancel inputs |
| `confirmationId` | 6 chars from `A-Z` (no I, O) and `0-9` (`generateConfirmationId` in `booking-service.ts`), unique | Shown to guests, in email subjects and in logs |

Tables: `bookings` and `payment_transactions` in `src/db/booking-schema.ts`.
Booking `status` is `pending` / `confirmed` / `cancelled`; `paymentStatus` is
`pending` / `paid` / `partially_refunded` / `refunded`; amounts are dollars.

## Tests

| File | Covers |
|---|---|
| `test/unit/date-range.test.ts`, `pricing.test.ts` | Overlap rules (calendar vs server), per-night pricing, no guest surcharge |
| `test/unit/cancellation-policy.test.ts` | Tiers, check-in cutoff, DST, policy schema |
| `test/unit/booking-store.test.ts` | Store steps, guest clamping, persistence, reset |
| `test/unit/ids.test.ts`, `validation.test.ts` | Id formats, booking/payment input schemas |
| `test/workers/bookings.test.ts` | Overlaps, holds, pricing parity, ownership, cancellation and refunds |
| `test/workers/confirm-payment.test.ts` | Intent verification, auto-refund on conflict, idempotency |
| `test/workers/stripe-webhook.test.ts` | Signature, `payment_intent.succeeded`, `charge.refunded`, log hygiene |
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
| `src/lib/booking-service.ts` | Holds, payment, confirmation, cancellation |
| `src/lib/availability.ts` | Availability queries and SQL guard |
| `src/lib/date-range.ts` | Date rules (shared with the client) |
| `src/lib/pricing.ts` | Per-night pricing |
| `src/lib/cancellation-policy.ts`, `cancellation-policy-store.ts` | Refund policy and versions |
| `src/lib/stripe-webhook.ts` | Stripe webhook handler |
| `src/lib/email-service.ts` | Booking and admin emails |
| `src/lib/scheduled-tasks.ts` | Expired hold cleanup cron |
| `src/lib/payment-validation.ts` | Booking/payment Zod schemas |
