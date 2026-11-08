# Stripe payment integration

Booking payments use a PaymentIntent paid in-app with the Stripe Payment
Element. The charge is captured immediately. A booking is confirmed only after
the server checks the PaymentIntent with Stripe and re-checks availability.

Webhook endpoint setup (Dashboard and Stripe CLI) is in `STRIPE_WEBHOOKS.md`.
The hold cleanup cron is in `CRON_JOBS_SETUP.md`.

**Sandbox only.** Development and pre-production use Stripe sandbox (test mode)
keys and endpoints. Never use live-mode keys or run live-mode or destructive
Stripe commands without explicit approval.

## SDKs and API version

| Package | Version | Where |
|---|---|---|
| `stripe` | `23.1.0` (pinned) | Server: `src/lib/stripe.ts` |
| `@stripe/stripe-js` | `^10.2.1` | Client: `loadStripe` in `src/components/booking/PaymentStep.tsx` |
| `@stripe/react-stripe-js` | `^7.0.1` | Client: `Elements`, `PaymentElement` |
| `@better-auth/stripe` | `1.7.18` (pinned, same as `better-auth`) | Customer creation, `src/lib/auth.ts` |

`STRIPE_API_VERSION` in `src/lib/stripe.ts` is `2026-10-28.endive`; keep the
webhook endpoints on the same version. `createStripe()` in the same file is the
only place a server Stripe client is built (server-only). Services get it from
`ServiceDeps` (`src/lib/deps.ts`): the tRPC context provides one, and the
webhook and cron handlers build one with `createServiceDeps()`.

## Payment flow

| Step | Client | Server |
|---|---|---|
| 1. Hold | Booking form | `bookings.createBooking` -> `createHold()` |
| 2. Prepare | `PaymentStep` mounts | `bookings.refreshBooking` -> `refreshHold()`, then `bookings.createPaymentIntent` -> `preparePayment()` |
| 3. Pay | `stripe.confirmPayment({ elements, redirect: 'if_required' })` | Stripe charges the card |
| 4. Confirm | On `succeeded`: `bookings.confirmPayment` | `confirmBookingPayment()` |
| 5. Backup | (guest may close the tab) | `payment_intent.succeeded` webhook -> `confirmBookingPayment()` |

tRPC procedures are in `src/integrations/trpc/bookings.ts`; services are in
`src/lib/booking-service.ts`. All payment procedures are `protectedProcedure`
and load the booking with `findAccessibleBooking()`, so a guest can act only on
their own booking (anything else is `NOT_FOUND`).

### 1. Pending hold (`createHold`)

- Checks the room is active, the guest count, and that check-in is not in the
  past.
- Releases the guest's earlier holds for the same room (`releaseOwnHolds()`):
  cancels each open PaymentIntent and deletes the hold. Holds whose intent is
  `succeeded` or `processing` are kept for the webhook or cron to confirm.
- Checks availability (`checkAvailability()` in `src/lib/availability.ts`).
- Prices the stay on the server (`quoteStay()`). Prices sent by the client are
  accepted by `createBookingSchema` but ignored.
- Inserts a `bookings` row with `status = 'pending'`,
  `paymentStatus = 'pending'`, the active cancellation policy id, and
  `expiresAt = now + HOLD_MINUTES` (30). A live hold blocks the dates for other
  guests.

`refreshHold()` extends an expired hold if the dates are still free, otherwise
throws `CONFLICT`.

### 2. PaymentIntent (`preparePayment`)

- Rejects bookings that are not `pending` or whose hold expired.
- Syncs the room's iCal import feeds (`syncRoomFeeds()`, trigger `checkout`;
  best effort, failures are logged), then re-checks availability excluding this
  booking. Taken dates throw `CONFLICT`.
- Reuses the booking's existing intent if its status is
  `requires_payment_method`, `requires_confirmation` or `requires_action` and
  its amount still matches.
- Otherwise gets the Stripe customer (`ensureStripeCustomer()`, see
  [Customers](#customers)) and creates a new intent:

| Field | Value |
|---|---|
| `amount` | `booking.totalAmount` in cents |
| `currency` | `usd` |
| `customer` | The user's `stripeCustomerId` |
| `metadata` | `bookingId`, `userId`, `roomId`, `type: 'booking'` |
| `automatic_payment_methods` | `{ enabled: true }` |
| `setup_future_usage` | `off_session` |

No capture method is set, so the charge is captured on confirmation. The intent
id is stored on `bookings.stripePaymentIntentId`. The procedure returns the
client secret and `STRIPE_PUBLISHABLE_KEY` (a text binding).

### 3. Payment Element (`PaymentStep`)

`src/components/booking/PaymentStep.tsx`, rendered by
`src/routes/booking/index.tsx` on the `payment` step. `PaymentStep` calls
`refreshBooking` then `createPaymentIntent` and mounts `Elements` with the
client secret. `PaymentForm` requires the policies checkbox, then calls
`stripe.confirmPayment` with `redirect: 'if_required'` and no `return_url`. Only
a `succeeded` result calls `bookings.confirmPayment`; the guest is then sent to
`/booking/confirmation/$publicId`. A `CONFLICT` from confirmation means the
payment was refunded; the form shows the server message and resets the booking
store.

### 4. Confirmation (`confirmBookingPayment`)

Shared by `bookings.confirmPayment`, the webhook and the cleanup cron, and
idempotent across them:

1. Returns early if the booking is already `confirmed` with the same intent
   (`already_confirmed`), or already cancelled with reason `dates_unavailable`
   for this intent (`refunded_conflict`). A confirmed booking with a different
   intent, or any other non-pending state, is `BAD_REQUEST`.
2. Retrieves the intent from Stripe (the webhook payload is not trusted) and
   `verifyIntent()` checks: `status === 'succeeded'`, `metadata.bookingId` and
   `metadata.userId` match the booking, amount equals `totalAmount` in cents,
   currency is `usd`. Any mismatch is `BAD_REQUEST`.
3. Confirms with one guarded `UPDATE`: `status = 'pending'` plus
   `noOverlapForBookingRow` (no other confirmed booking, imported event or admin
   block overlaps). The availability check and the write are one atomic
   statement. On success it sets `confirmed` / `paid`, stores the intent and
   customer ids, inserts a `payment_transactions` row (unique on the intent id,
   `onConflictDoNothing`) and sends the confirmation emails in the background.
4. If nothing was updated, it reloads the row. Another caller may have
   confirmed it (`already_confirmed`); otherwise the dates were taken.

### Automatic refund on conflict (`refundUnavailableBooking`)

When the guest paid but the dates were taken before confirmation:

- Full refund: `stripe.refunds.create({ payment_intent })`, idempotency key
  `refund-unavailable/<bookingId>`, metadata `reason: 'dates_unavailable'`.
- Booking set to `cancelled` / `refunded`, `cancelledBy: 'system'`,
  `cancellationReason: 'dates_unavailable'`, `stripeRefundId` stored; a
  `refunded` payment transaction is recorded.
- Cancellation emails to guest and admins, plus an admin alert.
- `bookings.confirmPayment` turns this outcome into `CONFLICT` for the client;
  the webhook acknowledges it with 200.

### Expired holds (cron)

`scheduledBookingCleanup()` (`5 8 * * *`, `src/lib/scheduled-tasks.ts`)
handles pending holds past `expiresAt`:

| Intent state | Action |
|---|---|
| No intent | Delete the hold |
| `succeeded` | `confirmBookingPayment()` (hold kept if that fails) |
| `processing` | Keep |
| Any other | Cancel the intent (unless `canceled`), delete the hold |
| Stripe unreachable | Keep, retry next run |

## Cancellations and refunds

`cancelBooking()` in `src/lib/booking-service.ts`, called by
`bookings.cancelBooking` (guest, refund `policy`) and
`bookings.adminCancelBooking` (`adminProcedure`, refund `full`, `policy` or
`none`).

- **Pending hold** (`cancelHold`): cancels the open intent so it can't be paid
  later, sets `cancelled` with refund 0. If the intent is `succeeded` or
  `processing`, throws `CONFLICT` instead.
- **Confirmed booking** (`cancelConfirmed`): the refund amount comes from the
  policy the booking was made under (`quoteBookingCancellation()`,
  `src/lib/cancellation-policy.ts`; default tiers: 100% at 72 h or more before
  check-in, 50% at 24 h, 0% after). Guests cannot cancel after check-in time.
  A positive amount is refunded with `stripe.refunds.create`, idempotency key
  `refund-cancel/<bookingId>`. The booking is then set to `cancelled` with
  `refunded` or `partially_refunded` by a guarded update
  (`status = 'confirmed'`), and cancellation emails are sent.
  `bookings.getCancellationQuote` previews the amount.

## Customers

- The Better Auth Stripe plugin (`stripe({ createCustomerOnSignUp: true })` in
  `src/lib/auth.ts`) creates a Stripe customer at sign-up with a direct API
  call and stores it on `user.stripeCustomerId`. Plugin subscriptions are not
  enabled.
- `ensureStripeCustomer()` in `src/lib/booking-service.ts` is the fallback for
  users without a customer: it creates one (idempotency key
  `customer/<userId>`) and saves the id on the user.
- Saved payment methods: intents set `setup_future_usage: 'off_session'`, so
  Stripe attaches the payment method to the customer. Nothing in the app lists
  or reuses saved methods.

## Webhooks

| Endpoint | Handler | Secret |
|---|---|---|
| `/api/stripe/webhook` | `src/routes/api/stripe.$.ts` -> `handleStripeWebhook()` in `src/lib/stripe-webhook.ts` | `STRIPE_TRPC_WEBHOOK_SECRET` |
| `/api/auth/stripe/webhook` | `@better-auth/stripe` plugin (`src/lib/auth.ts`) | `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` |

The Better Auth endpoint has no work today (no subscriptions, no `onEvent`); see
`STRIPE_WEBHOOKS.md`. Other paths under `/api/stripe/` return 404.

`handleStripeWebhook()` requires `Content-Type: application/json` and a
`stripe-signature` header, then verifies the raw body with
`stripe.webhooks.constructEventAsync()`. Failures return 400 with a generic
body (no verification details). Events handled in `dispatch()`:

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Finds the booking by `metadata.bookingId`, then by `stripePaymentIntentId`; runs `confirmBookingPayment()`. No booking: logged and acknowledged. |
| `payment_intent.payment_failed` | Logged only; the hold stays until it expires. |
| `charge.refunded` | Sets `paymentStatus` to `refunded` or `partially_refunded` and `refundAmount` (also for refunds made in the Dashboard). Booking `status` is not changed. |
| `refund.failed`, `refund.updated` (status `failed`) | Logs the refund id and emails an admin alert (key `refund-failed/<refundId>`). |
| Anything else | Acknowledged with 200, no action. |

Responses and retries:

- 200 when handled or ignored. `TRPCError`s other than `INTERNAL_SERVER_ERROR`
  from confirmation (verification failures) are logged and acknowledged, since
  retrying cannot fix them.
- 500 for other errors (database, Stripe API), so Stripe retries.
- There is no event-id dedup table. Idempotency comes from the guarded updates,
  the unique intent id on `payment_transactions`, Stripe idempotency keys on
  refunds, and Resend idempotency keys on emails.

**Never log** guest names, email addresses, phone numbers, card or payment
method data, client secrets, full event payloads, signatures or webhook
secrets. Logs carry Stripe ids (`pi_`, `re_`, event ids), booking confirmation
ids and error messages only.

## Emails

Sent with Resend from `src/lib/email-service.ts`, in the background via
`inBackground()` (failures are logged, never thrown). Each send uses a Resend
idempotency key so concurrent callers send once.

| Function | Trigger | Recipients | Idempotency key |
|---|---|---|---|
| `sendBookingConfirmedEmails` | Booking confirmed | Guest + admins | `booking-confirmed/<bookingId>` |
| `sendCancellationEmails` | Cancellation or automatic refund | Guest + admins | `booking-cancelled/<bookingId>` |
| `sendAdminAlert` | Automatic refund | Admins | `auto-refund-alert/<bookingId>` |
| `sendAdminAlert` | Refund failed (webhook) | Admins | `refund-failed/<refundId>` |
| `sendBookingConfirmationEmail` | `bookings.resendConfirmationEmail` | Guest | None (intentional resend) |

Admin recipients come from `getAdminEmails()` (`src/lib/admin-query.ts`).

## Environment variables

Declared in `.env.schema`, bound in `cloudflare.config.ts`.

| Variable | Kind | Used for |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret | Server Stripe client |
| `STRIPE_PUBLISHABLE_KEY` | `@public` text binding (build time) | Returned by `createPaymentIntent` for `loadStripe` |
| `STRIPE_TRPC_WEBHOOK_SECRET` | Secret | `/api/stripe/webhook` signature |
| `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` | Secret | `/api/auth/stripe/webhook` signature |
| `RESEND_API_KEY` | Secret | Emails |
| `BETTER_AUTH_URL` | `@public` text binding | Links in emails |

## Tests

| File | Covers |
|---|---|
| `test/workers/confirm-payment.test.ts` | Rejects intents that have not succeeded or mismatch on booking id, amount, currency or user; automatic refund on conflict (tRPC and webhook, refund once); front-end confirm + webhook + repeat sends one confirmation |
| `test/workers/stripe-webhook.test.ts` | Missing/invalid signature (400, no details echoed), 404 for other paths, `payment_intent.succeeded` confirms once and is replay-safe, unknown intent acknowledged, no email addresses in logs, `charge.refunded` partial and full |
| `test/workers/bookings.test.ts` | Holds, server-side pricing, cancellation refunds by policy, cancelling a hold cancels its intent |
| `test/workers/scheduled.test.ts` | Expired hold cleanup, including a hold whose intent succeeded |
| `test/workers/mocks.ts` | msw handlers: `mockStripePaymentIntents`, `mockStripeIntentCancel`, `mockStripeRefunds` (records idempotency keys), `mockResend` (honors `Idempotency-Key`) |
| `e2e/booking.spec.ts` | Full booking with test card `4242 4242 4242 4242` against the sandbox |

The Workers tests (`pnpm test:workers`) use fake keys from `vitest.config.ts`
(webhook secret `whsec_test`), sign events with
`stripe.webhooks.generateTestHeaderStringAsync`, and make no real Stripe calls.

The e2e test runs against `pnpm dev` (see `playwright.config.ts`), creates a
real sandbox PaymentIntent and a local booking, and is skipped unless
`E2E_STRIPE=1`, `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` are set
(`pnpm test:e2e e2e/booking.spec.ts`).
