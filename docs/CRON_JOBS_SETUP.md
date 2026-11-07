# Cron jobs

Cron triggers are declared in `cloudflare.config.ts` and handled by
`handleScheduledEvent` in `src/lib/scheduled-tasks.ts` (called from the
`scheduled` export in `src/server.ts`). The handler looks the cron string up in
`CRON_SCHEDULES`; an unknown string is logged and does nothing.

**Keep the two in sync.** `test/workers/scheduled.test.ts` fails if the triggers
in `cloudflare.config.ts` and the keys of `CRON_SCHEDULES` differ.

| Cron (UTC) | Task | What it does |
|---|---|---|
| `*/30 * * * *` | `scheduledCalendarSync` | Imports all active iCal feeds in parallel (`Promise.allSettled`). See `ICAL_SYNC_README.md`. |
| `5 8 * * *` | `scheduledBookingCleanup` | Deletes expired pending holds. A hold whose PaymentIntent succeeded is confirmed instead (or kept if that fails); an open intent is cancelled first; if Stripe can't be reached the hold is kept until the next run. |
| `15 9 * * *` | `scheduledIcalLogCleanup` | Deletes iCal sync history (`ical_sync_log`, `ical_sync_changes`) older than 30 days. |

Errors are logged with the cron string and rethrown, so failures show in
Workers observability (`pnpm tail`, or the dashboard). Feed errors are also
stored on the feed (`ical_feeds.last_error`) and in the sync log.

The KV namespace that used to hold sync summaries is no longer used (sync
history is in D1). The old `KV_ICAL_SYNC_LOG` namespace can be deleted from the
Cloudflare account once nothing else needs it.

Evaluate a `*/5 * * * *` import cron at production go-live.

## Changing a schedule

1. Edit the trigger in `cloudflare.config.ts`.
2. Edit the key in `CRON_SCHEDULES` (`src/lib/scheduled-tasks.ts`).
3. `pnpm test:workers` (the cron map test must pass), then deploy.

## Running a cron locally

With `pnpm dev` running, call the scheduled handler through the local
scheduled endpoint (see the `workers-development` skill and
`TESTING_CRON_JOBS_LOCALLY.md`), or run the tests, which call the handler with
`createScheduledController({ cron })` (`test/workers/scheduled.test.ts`,
`test/workers/ical-sync.test.ts`).
