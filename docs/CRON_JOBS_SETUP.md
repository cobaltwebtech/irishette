# Cron jobs

Cron triggers are declared in `cloudflare.config.ts` and handled by
`handleScheduledEvent` in `src/lib/server/scheduled-tasks.ts` (called from the
`scheduled` export in `src/server.ts`). The handler looks the cron string up in
`CRON_SCHEDULES`; an unknown string is logged and does nothing.

**Keep the two in sync.** `test/workers/scheduled.test.ts` fails if the triggers
in `cloudflare.config.ts` and the keys of `CRON_SCHEDULES` differ.

| Cron (UTC) | Task | What it does |
|---|---|---|
| `*/30 * * * *` | `scheduledPaymentRecovery`, then `scheduledCalendarSync` | **Payment recovery** (plan 05): bookings not updated for `PAYMENT_RECOVERY_AFTER_MINUTES` (15) that are `confirmed` + `authorized` go through `confirmBookingPayment` again (capture, or release the authorization), `cancelled` + `refund_pending` go through `retryCancellationRefund` (finds an existing cancellation refund first, else creates it with `pending_refund_amount`), and `pending` holds with a Checkout Session (expired less than a day ago, or still live) go through `settlePaidHold`: a session the guest completed with no confirmation (webhook failing, tab closed) is confirmed and captured; an open session is left alone. Each booking is isolated; a failure is retried next run. Then imports all active iCal feeds in parallel (`Promise.allSettled`). See `STRIPE_PAYMENT_INTEGRATION.md` and `ICAL_SYNC_README.md`. |
| `5 8 * * *` | `scheduledBookingCleanup` | Deletes expired pending holds. An open Checkout Session is expired first; a hold whose session was completed is settled by `confirmBookingPayment` instead (kept if it ends confirmed or that fails; deleted if the authorization was released); legacy holds with `paymentStatus: 'processing'` are skipped; if Stripe can't be reached the hold is kept until the next run. |
| `15 9 * * *` | `scheduledIcalLogCleanup`, then `scheduledSentEmailCleanup` | Deletes iCal sync history (`ical_sync_log`, `ical_sync_changes`) older than 30 days, and email dedupe rows (`sent_emails`) older than 7 days. |

The `*/30` and `15 9` tasks run through `runAll`: every task runs even if an
earlier one fails, then the first error is rethrown. Errors are logged with
the cron string and rethrown, so failures show in
Workers observability (`pnpm tail`, or the dashboard). Feed errors are also
stored on the feed (`ical_feeds.last_error`) and in the sync log.

The KV namespace that used to hold sync summaries is no longer used (sync
history is in D1). The old `KV_ICAL_SYNC_LOG` namespace can be deleted from the
Cloudflare account once nothing else needs it.

Evaluate a `*/5 * * * *` import cron at production go-live.

## Changing a schedule

1. Edit the trigger in `cloudflare.config.ts`.
2. Edit the key in `CRON_SCHEDULES` (`src/lib/server/scheduled-tasks.ts`).
3. `pnpm test:workers` (the cron map test must pass), then deploy.

## Running a cron locally

With `pnpm dev` running, call the scheduled handler through the local
scheduled endpoint (see the `workers-development` skill and
`TESTING_CRON_JOBS_LOCALLY.md`), or run the tests, which call the handler with
`createScheduledController({ cron })` (`test/workers/scheduled.test.ts`,
`test/workers/ical-sync.test.ts`). `test/workers/payment-recovery.test.ts`
calls `scheduledPaymentRecovery` directly.
