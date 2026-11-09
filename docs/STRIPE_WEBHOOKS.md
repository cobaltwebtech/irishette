# Stripe Webhooks

Quick reference for the app's two Stripe webhook endpoints: the Stripe Dashboard
setup for deployed environments, and local testing with the Stripe CLI.

Use the **sandbox** for development and pre-production. Never point live-mode
keys or endpoints at a non-production deployment.

## Endpoints

| Endpoint | Handler | Secret (env var) | Purpose |
|---|---|---|---|
| `/api/stripe/webhook` | `src/routes/api/stripe.$.ts` | `STRIPE_TRPC_WEBHOOK_SECRET` | Booking payments (required) |
| `/api/auth/stripe/webhook` | `@better-auth/stripe` plugin (`src/lib/auth.ts`) | `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` | Better Auth subscriptions (optional; see below) |

### Hosts

| Environment | Base URL | Stripe mode |
|---|---|---|
| Local dev | `http://localhost:3000` (via `stripe listen`, below) | Sandbox |
| Current deployment (pre-production) | `https://irishette.cobaltdev.workers.dev` | Sandbox |
| Production | `https://<PRODUCTION_HOST>` (TODO: custom domain not chosen yet) | Live |

Full dashboard URLs, for example:

- `https://<PRODUCTION_HOST>/api/stripe/webhook`
- `https://<PRODUCTION_HOST>/api/auth/stripe/webhook`

When the production domain is set, also update `BETTER_AUTH_URL`, set
`workersDev: false` in `cloudflare.config.ts`, and create the endpoints in
**live** mode with that host. Each live endpoint gets its own signing secret.

## Dashboard endpoint settings

These apply to both endpoints:

| Setting | Value |
|---|---|
| Events from | Your account |
| Payload style | Snapshot (both handlers need full objects, not thin events) |
| API version | `2026-10-28.endive` (matches `STRIPE_API_VERSION` in `src/lib/stripe.ts`) |

Endpoints created earlier were on `2025-08-27.basil`. Update or recreate them on
`2026-10-28.endive`, and save each endpoint's new signing secret.

### `/api/stripe/webhook` (booking payments)

Suggested name: `tRPC Endpoint`. Description: booking system payments
(Checkout Sessions, refunds, disputes); customer creation is handled by Better
Auth.

**Required.** Keep this list in sync with the `switch (event.type)` in
`dispatch` (`src/lib/stripe-webhook.ts`).

#### Booking payments with Checkout Sessions

Plan 02 Phase 3 moves booking payments from raw PaymentIntents to **Checkout
Sessions** (`ui_mode: 'elements'`, Payment Element on our own page). The same
endpoint (`/api/stripe/webhook`, `STRIPE_TRPC_WEBHOOK_SECRET`) receives the
events below. Fulfilment is driven by the webhook; the return page
(`/booking/confirmation/<publicId>?session_id=...`) only runs the same
idempotent confirmation as a fast path.

Every Stripe object the app creates carries our ids in metadata
(`bookingId`, `bookingPublicId`, `confirmationId`, `source: 'irishette'`; no
guest personal data), and the session's `client_reference_id` is the booking
id. Handlers look up the booking by `metadata.bookingId` first, then by the
stored Stripe ids (session, PaymentIntent, charge).

| Event | Required | What the app does |
|---|---|---|
| `checkout.session.completed` | yes | `payment_status: 'paid'` (or `no_payment_required`): confirm the booking (`confirmBookingPayment`). `unpaid` (a delayed payment method): set `paymentStatus: 'processing'` and keep holding the dates past the hold expiry. |
| `checkout.session.async_payment_succeeded` | yes | Confirm the booking (delayed payment methods). |
| `checkout.session.async_payment_failed` | yes | Release the hold (cancel it, `cancellationReason: 'payment_failed'`) and email the guest. |
| `checkout.session.expired` | yes | Release the hold if it is still pending and not processing. |
| `refund.created` | yes | Sync the refund status and amounts. For refunds made in the Stripe Dashboard: a full refund cancels the booking (`cancelledBy: 'system'`, frees the dates), a partial refund updates the amounts; email the guest and the admins with the full booking and refund details; create a `refund_issued` admin notification. Refunds the app makes (cancellations, `metadata.source: 'irishette'`) only sync the status. |
| `refund.updated` | yes | Status changes (`succeeded`, `failed`, `requires_action`) and the trace reference (ARN). Dashboard refunds email again only when the status becomes `succeeded` or `failed`, or the reference appears. |
| `refund.failed` | yes | Admin alert email and `refund_failed` notification, with Stripe's `failure_reason`. The guest is not emailed. |
| `charge.refunded` | yes | Totals sync only (`amount_refunded` → `refundAmount`, `paymentStatus`). No email. |
| `charge.dispute.created` | yes | Store the dispute (`payment_disputes`), link it to the booking and guest, create a `payment_dispute` admin notification. No email (Stripe emails the account owner). |
| `charge.dispute.updated` | yes | Update the stored dispute (status, evidence due date, reason) and mark its notification unread again. |
| `charge.dispute.closed` | yes | Store the outcome (`won` / `lost` / `warning_closed`) and mark the notification unread again. |
| `charge.dispute.funds_withdrawn` | yes | Record the withdrawal and mark the notification unread again. |
| `charge.dispute.funds_reinstated` | yes | Record the reinstatement and mark the notification unread again. |
| `payment_intent.payment_failed` | optional | Log only. The Payment Element shows the error, and the hold stays until it expires. |

Dispute events resurface their notification only when they are **newer** than
the last one applied (`last_stripe_event_created` / `last_stripe_event_id` on
`payment_disputes`); replays and out-of-order older events change nothing.

**No longer needed:** `payment_intent.succeeded` (Checkout Sessions report
the payment through `checkout.session.*`; the app creates no standalone
PaymentIntents).

**Dashboard endpoint (sandbox, and live at go-live):** subscribe
`/api/stripe/webhook` to exactly:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
payment_intent.payment_failed
```

**Link:** the Payment Element shows Link when it is enabled in the sandbox
under Settings → Payment methods. Nothing about Link is stored by the app.

Every other event is acknowledged with `200` and ignored. The local listener
and test commands are under "Local testing" below. The Better Auth endpoint
(`/api/auth/stripe/webhook`) is unchanged.

### `/api/auth/stripe/webhook` (Better Auth plugin)

Suggested name: `better-auth`.

**Currently optional.** `@better-auth/stripe` 1.7.18 acts only on:

- `checkout.session.completed` (subscription-mode sessions only)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The app does not enable plugin subscriptions and sets no `onEvent` hook, so the
endpoint has nothing to do today. The plugin creates the Stripe customer at
sign-up (`createCustomerOnSignUp`) with a direct API call, not a webhook. The
`customer.created`, `customer.updated` and `customer.deleted` events that were
configured earlier are ignored by the plugin.

If subscriptions are enabled later, subscribe this endpoint to the four events
above.

## Production secrets

Set the signing secrets (and keys) on the deployed Worker; Varlock does not
upload them from `.env.local`:

```bash
pnpm dlx wrangler secret put STRIPE_TRPC_WEBHOOK_SECRET --name irishette
pnpm dlx wrangler secret put STRIPE_BETTER_AUTH_WEBHOOK_SECRET --name irishette
```

Or pass `--secrets-file <PATH>` to `cf deploy`. Ask before changing remote secrets.

## Local testing with the Stripe CLI

Dashboard endpoints can only reach public URLs. Locally, `stripe listen` forwards
sandbox events to the dev server (`pnpm dev`).

### One-time setup

```bash
stripe login          # pick the sandbox used for local development
stripe config --list  # check which account the CLI is using
```

### Start the listeners

Run each listener in its own terminal and keep it running while you test.
`--latest` formats events with the newest API version, matching the pinned
`2026-10-28.endive`. Current Stripe CLI versions require `--events`,
`--all-snapshot` or `--all-thin`.

**Terminal A: booking payments:**

```bash
stripe listen --latest \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,refund.created,refund.updated,refund.failed,charge.refunded,charge.dispute.created,charge.dispute.updated,charge.dispute.closed,charge.dispute.funds_withdrawn,charge.dispute.funds_reinstated,payment_intent.payment_failed \
  --forward-to localhost:3000/api/stripe/webhook
```

**Terminal B: Better Auth plugin (optional):**

```bash
stripe listen --latest \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted \
  --forward-to localhost:3000/api/auth/stripe/webhook
```

### Configure the local secret

Each listener prints `Ready! Your webhook signing secret is whsec_...`. This
**CLI secret differs from the dashboard endpoint secrets**. It stays the same
across `stripe listen` runs for the same CLI login, so both listeners show the
same value. To print it without starting a listener:

```bash
stripe listen --print-secret
```

1. In `.env.local` (gitignored, never committed), set:
   - `STRIPE_TRPC_WEBHOOK_SECRET=<CLI whsec_...>`
   - `STRIPE_BETTER_AUTH_WEBHOOK_SECRET=<CLI whsec_...>`
   - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`: the same sandbox's keys
2. Encrypt the sensitive values in place: `pnpm exec varlock encrypt --file .env.local`.
3. Optionally validate with `pnpm env:check` (redacted; asks for Touch ID).
4. Restart `pnpm dev` (it runs `varlock run --inject vars -- cf dev`).

### Test

```bash
# Delivery + signature verification. Fixture objects carry no bookingId, so
# they match no booking and are acknowledged with 200 (no booking changes).
stripe trigger checkout.session.completed
stripe trigger checkout.session.expired
stripe trigger charge.refunded
stripe trigger refund.created
stripe trigger charge.dispute.created

# A bad signature must be rejected with 400
curl -i -X POST localhost:3000/api/stripe/webhook \
  -H 'content-type: application/json' \
  -H 'stripe-signature: t=1,v1=bad' \
  -d '{}'
```

Expected: the listener terminal shows `[200]` for each forwarded event, and
the dev server logs `Checkout Session cs_...: no booking (not ours), ignored`
(or nothing, for refunds and disputes of unknown payments; an unlinked dispute
is still stored and shown in Notifications).

If a trigger fixture is rejected on `2026-10-28.endive` (for example a
`payment_method_types` parameter), override it the way the PaymentIntent
fixtures needed:
`--remove payment_intent:payment_method_types --add 'payment_intent:automatic_payment_methods[enabled]=true'`.

**Full flows (sandbox, in the browser):**

| Flow | How | Expected |
|---|---|---|
| Card payment | Book a room, pay with `4242 4242 4242 4242` (any future expiry, any CVC) | Confirmation page shows "Your Booking is Confirmed!"; `checkout.session.completed` reports `already_confirmed` |
| 3-D Secure | `4000 0027 6000 3184` | Authenticate in the modal; same result |
| Declined | `4000 0000 0000 0002` | The Payment Element shows the decline; the hold stays until it expires |
| Dashboard refund | Refund a confirmed booking's payment in the Dashboard (full, then try partial on another) | Full: booking cancelled, dates free, guest + admin emails, `refund_issued` notification. Partial: `partially_refunded`, still confirmed |
| Dispute | Pay with `4000 0000 0000 0259` | `charge.dispute.created` (and `funds_withdrawn`): a `payment_dispute` notification and the "Payment disputes" panel on the booking; guest cancel is blocked |
| Expired session | Start checkout and wait for the hold to expire (35 min), or trigger `checkout.session.expired` for a real session | The hold is released |

Guest emails go to the address on the booking through Resend: use your own
test address.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `must specify events to forward using --events, --all-snapshot, or --all-thin` | Newer CLI; add one of those flags (see above). |
| Listener shows `[400]`, log says signature verification failed | `.env.local` has a dashboard secret instead of the CLI secret, or `pnpm dev` was not restarted. |
| Events forwarded but nothing happens to bookings | `stripe trigger` events have no `bookingId` metadata and match no booking; use a real checkout. |
| A `stripe trigger` fixture fails with ``The `payment_method_types` parameter is no longer supported`` | Use the overrides under "Test". |
| Listener shows `[500]` for a triggered event | The handler threw (database or Stripe API error); Stripe retries it. Events that match no booking are acknowledged with 200. Check the dev server log. |
| `Connection refused` in the listener | `pnpm dev` is not running on port 3000. |
| Events from the wrong account | Run `stripe login` again and pick the sandbox; check with `stripe config --list`. |
