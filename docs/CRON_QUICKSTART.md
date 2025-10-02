# 🚀 Quick Start - Cron Jobs

## Deploy Now

```bash
pnpm run deploy
```

## Test Cron Jobs

```bash
# Interactive test menu
./scripts/test-cron-jobs.sh

# Or manually tail logs
wrangler tail
```

## Cron Schedules

| Schedule | Frequency | Function | Purpose |
|----------|-----------|----------|---------|
| `0 * * * *` | Every hour | `scheduledCalendarSync()` | Sync Airbnb & Expedia calendars |
| `0 2 * * 7` | Weekly (Sun 2AM) | `scheduledCleanup()` | Clean up old logs |

## Quick Commands

```bash
# Deploy
pnpm run deploy

# View logs
wrangler tail

# Check recent syncs
wrangler d1 execute irishette-dev --command="SELECT * FROM ical_sync_log ORDER BY createdAt DESC LIMIT 5;" --remote

# List KV summaries
wrangler kv key list --namespace-id="481a64572c1145de958404c9512755d6" --prefix="sync_summary:"
```

## Manual Testing

1. Go to `/admin/property-management`
2. Click a room with Airbnb/Expedia URL configured
3. Click "Sync" button
4. Check sync status updates

## Files Modified

- ✅ `src/server.ts` - Added `scheduled()` handler
- ✅ `src/lib/scheduled-tasks.ts` - Already had sync logic
- ✅ `wrangler.jsonc` - Already had cron triggers

## What Happens on Sync

1. Fetches all active rooms
2. Downloads iCal feeds from Airbnb/Expedia
3. Parses booking events
4. Updates `room_availability` table
5. Logs to `ical_sync_log` table
6. Stores summary in KV storage

## Monitoring

- **Database**: Check `ical_sync_log` table
- **KV Storage**: Sync summaries (7-day retention)
- **Worker Logs**: `wrangler tail`
- **Admin Dashboard**: View last sync times per room

## Done! 🎉

Your automated calendar syncing is ready. Just deploy and it will run every hour automatically.
