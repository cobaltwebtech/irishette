# Plan 05: authorize first, capture after confirmation (no charge without a booking)

Status: **IMPLEMENTED 2026-11-11** on branch `fix/payment-manual-capture` (created from `chore/deps-cloudflare-email-logo`, which is not merged into `main` yet; the email changes there are needed here). Not committed. `pnpm build` and `pnpm check:bundle` pass. Remaining: the manual test-mode check below, and removing the `checkout.session.async_payment_*` events from the Stripe webhook endpoints (user).

Implementation notes (where the code differs from the first draft below):
- The API version `2026-10-28.endive` has no `payment_method_types` on Checkout Session create; the code uses `allowed_payment_method_types: ['card', 'link']` (a filter on the methods enabled in the Dashboard).
- Payment recovery runs every 30 minutes (in the `*/30` trigger, before the iCal sync), not daily. The `*/30` and 09:15 tasks run through `runAll`, so one failing task no longer skips the others.
- Paid holds nothing confirmed (webhook failing and the guest closed the tab before the return page): the recovery job also checks `pending` holds with a session (live, or expired less than a day ago) and confirms and captures a completed one (`settlePaidHold`), and an admin block first settles overlapping expired holds (`settleExpiredHoldsBeforeBlock`), so the block can't take paid dates.
- A transient Stripe error on a cancellation refund leaves `refund_pending` (the cron retries) instead of `refund_failed`; only a permanent refusal alerts the admin.

Read `AGENTS.md` first. All its rules apply (secrets, `--local`, no remote/deploy without asking, generated files, Fallow, post-build workflow). No commits, pushes or PRs until the user asks; no co-author or AI attribution lines in commit messages.

## Context

A review of the booking and payment flows (session "Cloudflare Workflows for booking process", 2026-11-11) found state-machine bugs. The user deferred Workflows and Queues until there is a real need, and asked to fix the bugs. The user's rule:

> Prevent the charge from happening without a booking, no matter what. No refund scenarios except user-initiated refunds.

Today the card is charged when the guest pays, and the booking is confirmed afterwards. When confirmation fails, the money is already taken:

- **B (silent).** `onSessionPaidOrCompleted` (`src/lib/stripe/stripe-webhook.ts`) acknowledges any non-internal `TRPCError` with a `console.warn`: session/booking mismatch, "already paid with another payment", "can no longer be paid" (booking cancelled). A deleted hold is logged as "not ours". In every case the guest is charged and nobody is told.
- **Automatic refund.** `refundUnavailableBooking` (`src/lib/booking/checkout-service.ts`) refunds when the dates were taken before the payment completed (iCal import, block, earlier hold).
- How it happens: a payment already in progress when a session is expired (cancel, cleanup, a second tab), deleted holds, and the dates race.

### Stripe facts (checked in the docs with `stripe docs`, 2026-11-11)

- "Place a hold on a payment method": a Checkout Session created with `ui_mode=elements` and `payment_intent_data[capture_method]=manual` authorizes without capturing (this app's exact setup).
- After authorization the PaymentIntent is `requires_capture`; `payment_intent.amount_capturable_updated` fires. `paymentIntents.capture` takes the money.
- `paymentIntents.cancel`: "You can directly cancel the PaymentIntent for a Checkout Session only when the PaymentIntent has a status of `requires_capture`." The held amount is released; nothing is charged, so there is no refund.
- Uncaptured PaymentIntents are cancelled automatically 7 days after creation. Card-not-present authorizations are valid 7 days (Visa: 4 days 18 hours).
- Manual capture is supported by `card` (this includes Apple Pay and Google Pay) and `link`, not by ACH/iDEAL. Afterpay and Affirm charge the customer at authorization in some cases and refund if not captured, so they are excluded.
- A session can only be expired while `open`.
- Not settled by the docs: the session's `payment_status` after authorization (the docs define `paid` as "funds are available in your account"). **Decide from the PaymentIntent status, never from `payment_status`.** Check the real value in test mode with `stripe listen` before go-live. Fees for cancelled authorizations: not in the docs; the user checks with Stripe.

## Design

### Payment statuses (`src/lib/booking/booking-status.ts`)

Add `authorized` to `paymentStatuses`: the booking is confirmed (dates claimed) and the card is authorized, capture pending. Text column with a TS-only enum, so no migration (confirm with `pnpm db:check`). `processing` stays in the enum and its read-side guards (availability, hold release) stay for rows that may already exist; nothing sets it any more.

### Checkout Session (`createSession`)

`payment_intent_data.capture_method: 'manual'` and `payment_method_types: ['card', 'link']`. Delayed methods (bank debits) are no longer offered.

### Confirmation (`confirmBookingPayment`)

The PaymentIntent (expanded on the session) is the source of truth:

| PaymentIntent | Booking | Action |
|---|---|---|
| `requires_capture` | `pending` | 1. Claim: guarded `UPDATE` to `confirmed` + `authorized` (same overlap guard as today). 2. Capture. 3. Record. |
| `requires_capture` | `confirmed`/`authorized`, same session | (retry after a crash) capture, record |
| `succeeded` | `confirmed`, same session | (retry after capture) mark `paid` if needed, record (idempotent; fixes bug A) |
| `requires_capture` | anything else (cancelled, other session, claim lost to an overlap) | **Release**: cancel the PaymentIntent. If the booking is still `pending` and the dates are taken, cancel it as `dates_unavailable` and email the guest that they were not charged |
| `canceled` | any | Nothing to capture. If the booking is `confirmed`/`authorized` with this session, cancel it as `payment_failed` |
| other | any | `BAD_REQUEST` "Payment has not completed" |

- **Capture** uses the idempotency key `capture/<bookingId>/<intentId>`. Transient Stripe errors (API, connection, rate limit) throw, so the webhook returns 500 and Stripe retries. Permanent errors (the authorization is no longer capturable) cancel the booking as `payment_failed`, cancel the PaymentIntent if it is still `requires_capture`, email the guest (not charged) and raise an inbox item.
- **Record** (`recordConfirmation`) runs again on every retry: `payment_transactions` insert is `onConflictDoNothing` (unique `stripe_payment_intent_id`) and the emails are deduped in `sent_emails`. A fast path skips the Stripe call when the booking is `paid` and its transaction row exists (return-page refreshes).
- Outcomes: `confirmed`, `already_confirmed`, `released` (replaces `refunded_conflict` and `processing`). The confirmation page shows "dates taken, you were not charged".

### Releasing an authorization (`releaseAuthorization`)

Cancels a `requires_capture` PaymentIntent (`cancellation_reason: 'abandoned'` or `'duplicate'`), treats "already canceled" as done, and raises a `payment_released` inbox item (new kind, `system` source; details: confirmation id if known, amount, session, PaymentIntent, reason, livemode). `refund_auto` stays in the kind list for existing rows; nothing creates it any more.

### Webhook (`stripe-webhook.ts`)

- `checkout.session.completed`: always calls `confirmBookingPayment` (no `payment_status` branching, no `markProcessing`).
- A permanent `TRPCError` or a missing booking for a session created by this app (`metadata.source`): release the authorization, raise the inbox item, return 200. A release that fails with a transient error throws (500, Stripe retries).
- `checkout.session.async_payment_succeeded` / `async_payment_failed`: removed (no delayed methods). Unknown events are acknowledged. Update the event list in `docs/STRIPE_WEBHOOKS.md` (dashboard subscriptions can drop them; the user does that).
- `markProcessing` and `releaseFailedPayment` are deleted; `sendPaymentFailedEmail` is reused for the capture-failed case (wording checked).

### Holds and cleanup

- `closeHoldSession` / `settleCompletedSession`: a completed session goes through `confirmBookingPayment` (which captures or releases). It returns `'paid'` only when the booking ended confirmed.
- Daily cleanup cron (`scheduledBookingCleanup`): also retries bookings stuck in `confirmed` + `authorized` for more than 15 minutes (capture or release), well inside the authorization window. Schedule unchanged.

### Remaining fixes from the review (refunds a user or admin starts)

- **D. Dashboard refund replay** (`refund-service.ts`): `upsertRefund` stores the new status before `charges.retrieve` and the booking update. Apply the effects first and write the status marker last (or detect "booking still confirmed after a full refund" on replay), so a Stripe retry redoes the work.
- **Refund catch split** (`refundCancellation`, `booking-service.ts`): only a failed `refunds.create` marks `refund_failed`. A failure in the database writes after a successful refund is logged and rethrown (the refund webhooks heal the totals); it must not tell the admin to refund by hand.
- **Stuck `refund_pending`**: a cancellation whose Worker died between the cancel `UPDATE` and `refunds.create`. The daily cleanup cron retries cancelled bookings in `refund_pending` for more than 15 minutes with the same idempotency key (`refund-cancel/<id>/<cents>`), so a retry can never refund twice. The refund amount is stored on the booking at cancel time (`cancellationRefundPercent` plus the policy quote) so the retry uses the original amount.

## Out of scope (deferred by the user)

Cloudflare Workflows and Queues, retries for background emails (`inBackground`), iCal per-feed fan-out, the iCal alert gate (`!feed.lastError`).

## Work order

1. Statuses, inbox kind, Stripe mocks (`test/workers/mocks.ts`: PaymentIntent status, `capture`/`cancel` endpoints with failure injection).
2. Checkout Session parameters.
3. Confirmation, capture, release; confirmation page outcome.
4. Webhook; hold release; cleanup cron.
5. D, catch split, stuck `refund_pending`.
6. Tests (rewrite the processing/auto-refund tests; add capture/release/replay tests), docs (`BOOKING_ARCHITECTURE.md`, `STRIPE_PAYMENT_INTEGRATION.md`, `STRIPE_WEBHOOKS.md`, `ADMIN_INBOX.md`, `TRPC_QUICK_REFERENCE.md`), AGENTS.md payments row.

## Verification

- Workers tests: authorization captured once on confirm; webhook + return page race captures once; claim lost to an overlap releases (no refund call); booking cancelled/other session/deleted hold releases and raises `payment_released`; capture transient error returns 500 and a replay captures; capture permanent error cancels as `payment_failed`; replay after capture records the transaction and sends emails once (bug A); cron captures a stuck `authorized` booking; dashboard full refund replay after a `charges.retrieve` failure cancels the booking (D); DB failure after a successful cancellation refund does not mark `refund_failed`; cron retries a stuck `refund_pending` with the same idempotency key.
- `pnpm check:fix`, `pnpm check`, `pnpm typecheck`, `pnpm build`, `pnpm check:bundle`, `pnpm db:check`, `pnpm test`, Fallow audit against `main`.
- Manual (user, test mode): `pnpm dev` + `stripe listen --forward-to localhost:3000/api/stripe/webhook`, pay with `4242...`, confirm the PaymentIntent is captured and record the session's `payment_status` at `checkout.session.completed` (steps in `docs/STRIPE_WEBHOOKS.md`). The dates-taken release can't be triggered by hand (an admin block is refused over a live hold); the workers tests cover it.
- Cancelling a booking still `authorized` (capture under way) is refused with `CONFLICT` until the capture finishes (found while writing the docs).
