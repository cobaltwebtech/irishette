# Stripe payment integration

Booking payments use a **Stripe Checkout Session** with `ui_mode: 'elements'`:
the Payment Element is rendered on our own payment step and confirmed with
`checkout.confirm()`. The charge is captured immediately. A booking is
confirmed only after the server retrieves the session from Stripe, checks it
belongs to the booking and re-checks availability. Fulfilment is driven by the
webhook; the return page runs the same idempotent confirmation as a fast path.

Webhook endpoint setup (Dashboard and Stripe CLI) is in `STRIPE_WEBHOOKS.md`.
The hold cleanup cron is in `CRON_JOBS_SETUP.md`.

**Sandbox only.** Development and pre-production use Stripe sandbox (test mode)
keys and endpoints. Never use live-mode keys or run live-mode or destructive
Stripe commands without explicit approval.

## SDKs and API version

| Package | Version | Where |
|---|---|---|
| `stripe` | `23.1.0` (pinned) | Server: `src/lib/stripe/stripe.ts` |
| `@stripe/stripe-js` | `^10.2.1` | Client: `loadStripe` in `src/components/booking/PaymentStep.tsx` |
| `@stripe/react-stripe-js` | `^7.0.1` | Client: `CheckoutElementsProvider`, `useCheckoutElements`, `PaymentElement` from `@stripe/react-stripe-js/checkout` |
| `@better-auth/stripe` | `1.7.18` (pinned, same as `better-auth`) | Customer creation, `src/lib/auth/auth.ts` |

`STRIPE_API_VERSION` in `src/lib/stripe/stripe.ts` is `2026-10-28.endive`; keep the
webhook endpoints on the same version. `createStripe()` in the same file is the
only place a server Stripe client is built (server-only). Services get it from
`ServiceDeps` (`src/lib/server/deps.ts`): the tRPC context provides one, and the
webhook and cron handlers build one with `createServiceDeps()`.

## Files

| File | What |
|---|---|
| `src/lib/booking/checkout-service.ts` | Session creation (`prepareCheckout`), confirmation (`confirmBookingPayment`), automatic refund on conflict, hold/session helpers (`closeHoldSession`, `markProcessing`, `releaseFailedPayment`, `releaseExpiredSessionHold`) |
| `src/lib/booking/booking-service.ts` | Pricing, holds (`createHold`, `refreshHold`, the priority rule), cancellations |
| `src/lib/booking/refund-service.ts` | Refund webhooks (`refund.*`, `charge.refunded`) |
| `src/lib/booking/dispute-service.ts` | Dispute webhooks (`charge.dispute.*`), `hasOpenDispute` |
| `src/lib/stripe/stripe-webhook.ts` | Signature check and `dispatch` |
| `src/lib/stripe/stripe.ts` | Client, `stripeBookingMetadata`, `toCents`, `stripeId` |

## Payment flow

| Step | Client | Server |
|---|---|---|
| 1. Hold | Booking form | `bookings.createBooking` -> `createHold()` |
| 2. Prepare | `PaymentStep` mounts | `bookings.refreshBooking` -> `refreshHold()`, then `bookings.createCheckoutSession` -> `prepareCheckout()` |
| 3. Pay | `checkout.confirm({ redirect: 'if_required' })` | Stripe charges the card (or starts a delayed payment) |
| 4. Return | Navigate to `/booking/confirmation/<publicId>?session_id=cs_...` (redirect methods come back to the same URL from Stripe) | The page calls `bookings.confirmCheckout` -> `confirmBookingPayment()` |
| 5. Fulfil | (guest may close the tab) | `checkout.session.completed` / `async_payment_succeeded` webhook -> `confirmBookingPayment()` |

All payment procedures are `protectedProcedure` and load the booking with
`findAccessibleBooking()`, so a guest can act only on their own booking
(anything else is `NOT_FOUND`).

### 1. Pending hold (`createHold`)

- Checks the room is active, the guest count, and that check-in is not in the
  past.
- Releases the guest's earlier holds for the same room (`releaseOwnHolds()`):
  expires each hold's open Checkout Session and deletes the hold. A hold whose
  session was paid (or whose delayed payment is processing) is kept and
  confirmed.
- **Priority rule (first hold wins while it is live):** other guests' expired
  holds on the same dates are released first (`releaseExpiredHolds()`): their
  session is expired so it can't be paid. If Stripe reports the session was
  completed after all, that booking is confirmed (or marked processing) and
  the new hold is refused with `CONFLICT`. Nobody pays and then gets refunded.
- Checks availability (`checkAvailability()` in `src/lib/booking/availability.ts`): a
  confirmed booking, a live hold, or a hold with `paymentStatus: 'processing'`
  (even past its expiry) blocks the dates.
- Prices the stay on the server (`quoteStay()`). Prices sent by the client are
  accepted by `createBookingSchema` but ignored.
- Inserts a `bookings` row with `status = 'pending'`,
  `paymentStatus = 'pending'`, the active cancellation policy id, and
  `expiresAt = now + HOLD_MINUTES` (**35**).

`refreshHold()` extends an expired hold if the dates are still free, otherwise
throws `CONFLICT`.

### 2. Checkout Session (`prepareCheckout`)

- Rejects bookings that are not `pending` or whose hold expired. A hold whose
  delayed payment is processing returns `{ status: 'complete' }`.
- Syncs the room's iCal import feeds (`syncRoomFeeds()`, trigger `checkout`;
  best effort), then re-checks availability excluding this booking. Taken
  dates throw `CONFLICT`.
- **Reuses** the hold's open session while its amount equals the booking total,
  its `expires_at` equals the hold expiry and at least 10 minutes are left.
  A session that was already paid confirms the booking and returns
  `{ status: 'complete' }` (the client goes to the confirmation page).
- Otherwise **expires** the old session and creates a new one, extending the
  hold to `now + HOLD_MINUTES` in the same guarded write
  (`stripeSessionId` must still be the old value; a concurrent request's
  session wins and ours is expired). A session's expiry can't be extended, so
  hold and session always expire at the same moment.

| Field | Value |
|---|---|
| `mode` / `ui_mode` | `payment` / `elements` |
| `customer` | The user's Stripe customer (`ensureStripeCustomer()`); its email is the Checkout email and lets Link recognise returning Link users |
| `line_items` | `price_data` from **our** pricing (`checkoutLineItems()`): "Room, N nights", "Service fee", "State hotel occupancy tax", "City hotel occupancy tax" (zero lines left out). The taxes are on the room price plus the service fee; the two tax lines are the amounts stored on the booking (`stateTaxAmount`, `cityTaxAmount`; see `TAX_REPORTING.md`). No `automatic_tax`. |
| `client_reference_id` | Booking `id` |
| `metadata`, `payment_intent_data.metadata` | `stripeBookingMetadata()`: `bookingId`, `bookingPublicId`, `confirmationId`, `source: 'irishette'`. No personal data. |
| `payment_intent_data.description` | `Irishette booking <confirmationId>` |
| `saved_payment_method_options.payment_method_save` | `disabled` (no saved cards) |
| `return_url` | `<BETTER_AUTH_URL>/booking/confirmation/<publicId>?session_id={CHECKOUT_SESSION_ID}` |
| `expires_at` | The hold expiry (Stripe allows 30 minutes to 24 hours; `HOLD_MINUTES` is 35 for clock skew) |
| `integration_identifier` | `irishette_booking_qzmvtrkd` |
| Idempotency key | `checkout/<bookingId>/<expiresAt>/<amountCents>` |

No `payment_method_types` (dynamic payment methods). After creation the
server asserts `amount_total === toCents(totalAmount)`; a mismatch expires the
session and fails. The session id is stored on `bookings.stripeSessionId`.

**Link:** the Payment Element shows Link when it is enabled in the Dashboard
(Settings → Payment methods). Link keeps the guest's details in their own Link
account; nothing about it is stored here. `ContactDetailsElement` is not
needed: the email comes from the customer.

### 3. Payment Element (`PaymentStep`)

`src/components/booking/PaymentStep.tsx`, on the `payment` step of
`src/routes/booking/index.tsx`. `PaymentStep` calls `refreshBooking` then
`createCheckoutSession` and mounts `CheckoutElementsProvider` with the client
secret and `elementsOptions.appearance` (the site colours and font).
`PaymentForm` uses `useCheckoutElements()`:

- shows the session's line items and total, and disables Pay if the total
  differs from the booking store's total;
- disables Pay until `checkout.canConfirm` and the policies checkbox;
- calls `checkout.confirm({ redirect: 'if_required' })`, shows its error
  message (never logs whole error objects), and on success navigates to the
  confirmation page with `?session_id=`.

### 4. Confirmation (`confirmBookingPayment`)

Shared by `bookings.confirmCheckout` (return page), the webhook, the hold
cleanup cron and the priority rule; idempotent across all:

1. Returns early if the booking is already `confirmed` with the same session
   (`already_confirmed`), or cancelled with reason `dates_unavailable` for this
   session (`refunded_conflict`). Any other non-pending state is `BAD_REQUEST`.
2. Retrieves the session from Stripe with `expand: ['payment_intent',
   'payment_intent.payment_method']` (payloads are not trusted) and checks
   `metadata.bookingId`, `client_reference_id`, `amount_total`, `currency` and
   `mode`. Any mismatch is `BAD_REQUEST`. A session that is not `complete` is
   `BAD_REQUEST`; a complete but `unpaid` session (a delayed payment method)
   sets `paymentStatus: 'processing'` and returns `processing`.
3. Confirms with one guarded `UPDATE`: `status = 'pending'` plus
   `noOverlapForBookingRow(now)` (no other confirmed booking, earlier live or
   processing hold, imported event or admin block overlaps). On success it
   sets `confirmed` / `paid`, stores the session, PaymentIntent and customer
   ids, inserts a `payment_transactions` row (session, PaymentIntent, **charge
   id** from `latest_charge`, payment method type) and sends the confirmation
   emails in the background.
4. If nothing was updated, it reloads the row: another caller confirmed it
   (`already_confirmed`), or the dates were taken (automatic refund below).

The same-day cutoff is **not** re-checked: a hold created in time stays payable
until it expires (plan 02, B3).

### Automatic refund on conflict (`refundUnavailableBooking`)

When the guest paid but the dates were taken before confirmation:

- Full refund of the session's PaymentIntent, metadata
  `stripeBookingMetadata()` + `reason: 'dates_unavailable'`, idempotency key
  `refund-unavailable/<bookingId>`; recorded in `payment_refunds` (source
  `app`).
- Booking set to `cancelled` / `refunded`, `cancelledBy: 'system'`,
  `cancellationReason: 'dates_unavailable'`.
- Cancellation emails to guest and admins, an admin alert and a `refund_auto`
  inbox item.
- `bookings.confirmCheckout` returns `refunded_conflict`; the confirmation page
  shows the cancelled booking with a toast. The webhook acknowledges with 200.

### Delayed payment methods

A completed but unpaid session (`checkout.session.completed` with
`payment_status: 'unpaid'`) marks the hold `paymentStatus: 'processing'`. It
keeps its dates past `expiresAt` (`holdsDatesCondition`), and the cleanup cron
and `checkout.session.expired` skip it. Then:

- `checkout.session.async_payment_succeeded` confirms it;
- `checkout.session.async_payment_failed` cancels it
  (`cancellationReason: 'payment_failed'`) and emails the guest.

### Expired holds (cron)

`scheduledBookingCleanup()` (`5 8 * * *`, `src/lib/server/scheduled-tasks.ts`)
releases pending holds past `expiresAt` that are not processing
(`releaseExpiredHold()` → `closeHoldSession()`):

| Session state | Action |
|---|---|
| No session | Delete the hold |
| `open` | Expire the session, delete the hold |
| `expired` / unknown to Stripe | Delete the hold |
| `complete` (paid) | `confirmBookingPayment()` (kept if that fails) |
| `complete` (unpaid) | Mark processing, keep |
| Stripe unreachable | Keep, retry next run |

## Cancellations and refunds

`cancelBooking()` in `src/lib/booking/booking-service.ts`, called by
`bookings.cancelBooking` (guest, refund `policy`) and
`bookings.adminCancelBooking` (`adminProcedure`, refund `full`, `policy` or
`none`).

- **Pending hold** (`cancelHold`): expires the open session so it can't be paid
  later, sets `cancelled` with refund 0. If the session was paid or the payment
  is processing, throws `CONFLICT` instead.
- **Confirmed booking** (`cancelConfirmed`): the refund amount comes from the
  policy the booking was made under (`quoteBookingCancellation()`): the tier
  percent of the booking total, capped at what is still paid after earlier
  (e.g. Dashboard) refunds. **The cancellation is saved first** (guarded
  update to `cancelled`, `paymentStatus: 'refund_pending'`, the applied tier),
  **then** the refund is created (`stripeBookingMetadata()` +
  `reason: 'cancellation'`, idempotency key
  `refund-cancel/<bookingId>/<amountCents>`, recorded in `payment_refunds` as
  source `app`, so the refund webhooks send no second email), then the result
  is stored (`refunded` / `partially_refunded`). A Stripe failure leaves the
  booking cancelled with `refund_failed` and alerts the admins (email +
  `refund_failed` notification). A refund amount that differs from the one the
  dialog showed (`expectedRefundAmount`) is `CONFLICT` before anything
  changes. See `BOOKING_ARCHITECTURE.md` for the windows (4:00 PM CT,
  wall-clock cutoffs).
- **Open dispute** (`hasOpenDispute`): guests get `canCancel: false` and
  `CONFLICT` ("cannot be cancelled online, please contact us"), with no
  mention of the dispute anywhere on guest pages or responses;
  admins default to no refund and must pass `confirmDisputeRefund: true` to
  refund (Stripe warns a refund on a disputed charge can credit the guest
  twice).

## Refunds made in the Stripe Dashboard

`handleRefundEvent()` (`src/lib/booking/refund-service.ts`) upserts every refund into
`payment_refunds` and compares the stored status:

- **App refunds** (`metadata.source === 'irishette'`): status sync only. A
  failure sets `paymentStatus: 'refund_failed'` and alerts the admins.
- **Dashboard refunds:** reads the charge (`amount`, `amount_refunded`, card
  brand/last 4). A full refund of a confirmed booking cancels it
  (`cancelledBy: 'system'`, `cancellationReason: 'refunded_in_stripe'`), which
  frees its dates; a partial refund sets `refundAmount` and
  `partially_refunded`. `payment_transactions.amount_refunded` follows.
  The guest and the admins get `sendRefundEmails` (full booking details + the
  refund: amount, total refunded, remaining, reason, status, card, date, trace
  reference, new booking status), idempotency key
  `refund/<refundId>/<status>[/ref]`, sent when the refund is first seen, when
  it becomes `succeeded`, and when the trace reference (ARN) appears. A
  `refund_issued` inbox item (dedupe `refund:<refundId>`) resurfaces on each
  status change.
- **Failed refunds** (`refund.failed`, or `refund.updated` to `failed`): admin
  alert email + `refund_failed` inbox item with `failure_reason`, once per
  refund. The guest is not emailed.
- `charge.refunded`: totals only (`refundAmount`, `paymentStatus`,
  `payment_transactions`), no email.

## Disputes

`handleDisputeEvent()` (`src/lib/booking/dispute-service.ts`) stores each dispute in
`payment_disputes` (upsert by `stripe_dispute_id`) with the amount, reason,
status, network reason code, evidence due date, card brand/last 4 and the
closed / funds withdrawn / reinstated times. It links the dispute to the
booking through the charge's PaymentIntent `metadata.bookingId`, then the
stored charge id (`payment_transactions.stripe_charge_id`), then
`bookings.stripePaymentIntentId`; unmatched disputes are stored unlinked.

Each event newer than `last_stripe_event_created` (or the same second with a
different event id) updates the row and resurfaces the `payment_dispute` inbox
item (dedupe `dispute:<disputeId>`, linked through `payment_dispute_id`); a
replay or an older event changes nothing. No email (Stripe emails the account
owner). The admin booking and guest pages show a "Payment disputes" panel, and
the admin booking lists show an "Open dispute" badge.

## Customers

- The Better Auth Stripe plugin (`stripe({ createCustomerOnSignUp: true })` in
  `src/lib/auth/auth.ts`) creates a Stripe customer at sign-up and stores it on
  `user.stripeCustomerId`. Plugin subscriptions are not enabled.
- `ensureStripeCustomer()` in `src/lib/booking/checkout-service.ts` is the fallback for
  users without a customer (idempotency key `customer/<userId>`).
- **No saved cards:** sessions set
  `saved_payment_method_options.payment_method_save: 'disabled'` and no
  `setup_future_usage`. Refunds go back to the card used.

## Webhooks

| Endpoint | Handler | Secret |
|---|---|---|
| `/api/stripe/webhook` | `src/routes/api/stripe.$.ts` -> `handleStripeWebhook()` in `src/lib/stripe/stripe-webhook.ts` | `STRIPE_TRPC_WEBHOOK_SECRET` |

`handleStripeWebhook()` requires `Content-Type: application/json` and a
`stripe-signature` header, then verifies the raw body with
`stripe.webhooks.constructEventAsync()`. Failures return 400 with a generic
body. The handled events (`dispatch()`) and the Dashboard list are in
`STRIPE_WEBHOOKS.md`.

Responses and retries:

- 200 when handled or ignored. `TRPCError`s other than `INTERNAL_SERVER_ERROR`
  from confirmation (verification failures) are logged and acknowledged.
- 500 for other errors (database, Stripe API), so Stripe retries.
- Idempotency comes from guarded updates, unique ids
  (`payment_transactions.stripe_payment_intent_id`,
  `payment_refunds.stripe_refund_id`, `payment_disputes.stripe_dispute_id`,
  inbox `dedupe_key`), the stored refund status and dispute event order,
  Stripe idempotency keys, and the `sent_emails` claims that stop duplicate emails.

**Never log** guest names, email addresses, phone numbers, card or payment
method data, client secrets, full event payloads, signatures or webhook
secrets. Logs carry Stripe ids (`cs_`, `pi_`, `re_`, `dp_`, event ids),
booking confirmation ids and error messages only.

## Emails

Sent with Cloudflare Email Service (the `EMAIL` binding) from `src/lib/email/email-service.ts`, in the background via
`inBackground()`. Booking emails share one booking-details section
(`src/components/email/BookingDetailsSection.tsx`: confirmation id, room,
check-in/out with times, nights, guests, guest name/email/phone, special
requests, price breakdown); cancellation, refund and payment-failed emails use
`BookingNoticeEmail`.

| Function | Trigger | Recipients | Dedupe key (`sent_emails`, one claim per message: `<key>#<index>`) |
|---|---|---|---|
| `sendBookingConfirmedEmails` | Booking confirmed | Guest + admins | `booking-confirmed/<bookingId>` |
| `sendCancellationEmails` | Cancellation or automatic refund | Guest + admins | `booking-cancelled/<bookingId>` |
| `sendRefundEmails` | Dashboard refund (new, succeeded, trace reference) | Guest + admins | `refund/<refundId>/<status>[/ref]` |
| `sendPaymentFailedEmail` | `checkout.session.async_payment_failed` | Guest | `payment-failed/<bookingId>` |
| `sendAdminAlert` | Automatic refund / refund failed | Admins | Throttled: one per alert per hour, keyed `alert:<key or subject>@<hour>` (`auto-refund-alert/<bookingId>` / `refund-failed/<refundId>`) |
| `sendBookingConfirmationEmail` | `bookings.resendConfirmationEmail` | Guest | None (intentional resend) |

Guest copy says refunds take 5-10 business days (Stripe).

## Environment variables

Declared in `.env.schema`, bound in `cloudflare.config.ts`.

| Variable | Kind | Used for |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret | Server Stripe client |
| `STRIPE_PUBLISHABLE_KEY` | `@public` text binding (build time) | Returned by `createCheckoutSession` for `loadStripe` |
| `STRIPE_TRPC_WEBHOOK_SECRET` | Secret | `/api/stripe/webhook` signature |
| `BETTER_AUTH_URL` | `@public` text binding | `return_url`, links in emails |

## Tests

| File | Covers |
|---|---|
| `test/workers/checkout.test.ts` | Session parameters (line items = total, metadata, no saved cards, no `payment_method_types`, `expires_at` = hold expiry, idempotency key), reuse, expire-and-recreate, already-paid session; `confirmCheckout` verification; confirmation ids and transaction; processing holds keep their dates; automatic refund (tRPC and webhook, once); one confirmation email across return page + webhook + repeat; the priority rule |
| `test/workers/stripe-webhook.test.ts` | Signatures (400, nothing echoed), 404 for other paths; `checkout.session.completed` (confirm once, unpaid → processing, unknown session, no addresses in logs); async success/failure; `checkout.session.expired`; `charge.refunded`; Dashboard full/partial refunds (cancel, emails, inbox, replays, trace reference); app refunds; `refund.failed`; disputes (store, link, inbox, no email, replay, out of order, closed, unlinked, fallback link, guest/admin cancel guards) |
| `test/workers/bookings.test.ts` | Holds, pricing, cancellation refunds by policy and their metadata, cancelling a hold expires its session, processing holds can't be cancelled |
| `test/workers/scheduled.test.ts` | Expired hold cleanup: paid session confirmed, open session expired, processing kept |
| `test/unit/stripe-metadata.test.ts` | `stripeBookingMetadata` keys and no personal data; `checkoutLineItems` totals |
| `test/workers/mocks.ts` | msw: `mockStripeCheckout` (stateful sessions: create / retrieve with expand / expire, `complete()`), `mockStripeCharges`, `mockStripeRefunds`; `mockEmail` (stub for the `EMAIL` binding) |
| `e2e/booking.spec.ts` | Full booking with test card `4242 4242 4242 4242` against the sandbox (`E2E_STRIPE=1`) |

The Workers tests use fake keys from `vitest.config.ts` (webhook secret
`whsec_test`), sign events with `stripe.webhooks.generateTestHeaderStringAsync`,
and make no real Stripe calls.
