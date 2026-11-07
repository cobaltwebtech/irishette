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

Suggested name: `tRPC Endpoint`. Description: booking system payments; customer
creation and updates are handled by Better Auth.

**Required.** The handler acts on these:

| Event | What the app does |
|---|---|
| `payment_intent.succeeded` | Confirms the booking (primary event for the in-app checkout) |
| `payment_intent.payment_failed` | Marks the booking payment as failed |
| `checkout.session.completed` | Confirms bookings paid via a hosted Checkout Session (legacy flow) |
| `checkout.session.expired` | Cleans up the pending booking for an expired Checkout Session |

**Optional.** The handler only logs these, with no action:

| Event | Notes |
|---|---|
| `charge.succeeded`, `charge.updated`, `charge.failed` | Child events of the PaymentIntent, already covered above |
| `mandate.updated` | Only relevant for saved payment methods |

**Not needed:** `checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed`. They are not handled, and checkout is
card-only (`allowed_payment_method_types: ['card']`), so they never fire.

Keep this list in sync with the `switch (event.type)` in
`src/routes/api/stripe.$.ts`.

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

**Terminal A: booking payments (required + optional events):**

```bash
stripe listen --latest \
  --events payment_intent.succeeded,payment_intent.payment_failed,checkout.session.completed,checkout.session.expired,charge.succeeded,charge.updated,charge.failed,mandate.updated \
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
# Delivery + signature verification (no booking metadata, so no booking changes).
# The CLI's payment_intent fixture still sends payment_method_types, which
# 2026-10-28.endive rejects; swap it for automatic payment methods:
PI_FIX=(--remove payment_intent:payment_method_types
  --add 'payment_intent:automatic_payment_methods[enabled]=true'
  --add 'payment_intent:automatic_payment_methods[allow_redirects]=never')
stripe trigger payment_intent.succeeded "${PI_FIX[@]}"
stripe trigger payment_intent.payment_failed "${PI_FIX[@]}"
stripe trigger checkout.session.completed

# A bad signature must be rejected with 400
curl -i -X POST localhost:3000/api/stripe/webhook \
  -H 'content-type: application/json' \
  -H 'stripe-signature: t=1,v1=bad' \
  -d '{}'
```

Expected: the listener terminal shows `[200]` for each forwarded event, and the
dev server logs `Stripe webhook received`. `payment_intent.succeeded` also
produces `charge.succeeded` / `charge.updated` events.

**Full booking flow:** book a room in the browser and pay with test card
`4242 4242 4242 4242` (any future expiry, any CVC). The resulting
`payment_intent.succeeded` carries our `booking_id` metadata, so the booking
should change to `confirmed`.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `must specify events to forward using --events, --all-snapshot, or --all-thin` | Newer CLI; add one of those flags (see above). |
| Listener shows `[400]`, log says signature verification failed | `.env.local` has a dashboard secret instead of the CLI secret, or `pnpm dev` was not restarted. |
| Events forwarded but nothing happens to bookings | `stripe trigger` events have no `booking_id` metadata; use a real checkout. |
| `stripe trigger payment_intent.*` fails with ``The `payment_method_types` parameter is no longer supported`` | Use the `PI_FIX` overrides above. |
| Listener shows `[500]` for a triggered event | The handler threw; a test event without `booking_id` metadata must be acknowledged with 200, not fail. Check the dev server log. |
| `Connection refused` in the listener | `pnpm dev` is not running on port 3000. |
| Events from the wrong account | Run `stripe login` again and pick the sandbox; check with `stripe config --list`. |
