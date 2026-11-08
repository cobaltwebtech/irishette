# Testing Cron Jobs in Local Development

The Worker's `scheduled` handler lives in `src/server.ts` and dispatches to
`handleScheduledEvent` in `src/lib/scheduled-tasks.ts`. Cron triggers are
declared in `cloudflare.config.ts`.

| Schedule | Task |
|---|---|
| `*/30 * * * *` | iCal import sync |
| `5 8 * * *` | Expired pending bookings cleanup (08:05 UTC) |
| `15 9 * * *` | iCal sync log cleanup (09:15 UTC) |

Changing a schedule requires updating both `cloudflare.config.ts` and
`CRON_SCHEDULES` in `src/lib/scheduled-tasks.ts` (see `CRON_JOBS_SETUP.md`).

The quickest check is the test suite, which calls the handler directly:
`pnpm test:workers` (`test/workers/scheduled.test.ts`,
`test/workers/ical-sync.test.ts`).

## Trigger a cron locally

1. Start the dev server (local D1 in `.cloudflare/state`):

   ```bash
   pnpm dev            # runs `cf dev` on http://localhost:3000
   ```

2. Trigger a schedule. Encode spaces as `+`:

   ```bash
   curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=*/30+*+*+*+*"   # iCal sync
   curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=5+8+*+*+*"      # pending bookings cleanup
   curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=15+9+*+*+*"     # sync log cleanup
   ```

   Or open Local Explorer at `http://localhost:3000/cdn-cgi/local/explorer`.

   The old `/__scheduled` and `/cdn-cgi/handler/scheduled` endpoints are no
   longer used.

3. Watch the dev server terminal. Each task logs one summary line, e.g.:

   ```
   iCal sync: 0 feed(s), 0 failed, 0 change(s), 0 conflict(s)
   Expired holds: 0 deleted, 0 kept (payment found or unknown)
   Sync history cleanup: 0 run(s), 0 change(s) older than ... removed
   ```

   An unknown cron string logs `Unknown cron schedule "...": nothing to do`.

The local seed (`pnpm db:reset:local`) adds one **inactive** feed per room with
a placeholder URL, so the sync makes no external requests. Add a real feed URL
(and activate it) in the admin UI to test a fetch.

## Inspect local data

```bash
# D1 (always --local; `cf d1` defaults to the REMOTE database otherwise)
cf d1 raw 7a52bbfc-592e-4792-990e-6a5e51ca8cbd --local --persist-to .cloudflare/state \
  "--sql=SELECT * FROM ical_sync_log ORDER BY created_at DESC LIMIT 5"

# Browse tables in Drizzle Studio
pnpm db:studio
```

Sync history lives in D1 (`ical_sync_log`, `ical_sync_changes`, and the
`last_*` columns on `ical_feeds`); the admin iCal page shows it too.

## Production

- Live logs: `pnpm tail` (runs `pnpm dlx wrangler tail irishette`; `cf` has no
  tail command yet).
- Manual trigger: Cloudflare dashboard > Workers & Pages > irishette > Settings >
  Triggers.

## Common issues

- **Secrets are undefined in `env`:** a secret reaches `env` only if it is
  declared with `bindings.secret()` in `cloudflare.config.ts`. Local values come
  from Varlock (`.env.schema` + the encrypted `.env.local`, injected by
  `varlock run`); check them with `pnpm env:check`.
- **Binding is undefined:** check `worker.env` in `cloudflare.config.ts`, then
  restart `pnpm dev`.
- **No rooms found:** run `pnpm db:reset:local` to re-create and seed the local
  database.
