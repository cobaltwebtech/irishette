# Cron Job Setup - Summary & Deployment Guide

## ✅ What's Already Complete

Your cron job setup is now **complete** and ready for deployment! Here's what's in place:

### 1. **Scheduled Task Logic** (`src/lib/scheduled-tasks.ts`)
- ✅ `scheduledCalendarSync()` - Syncs all active rooms with Airbnb and Expedia calendars
- ✅ `scheduledCleanup()` - Cleans up old sync logs (placeholder for future implementation)
- ✅ `handleScheduledEvent()` - Main handler that routes cron triggers to appropriate functions
- ✅ Error handling and logging
- ✅ KV storage for monitoring sync summaries

### 2. **Worker Configuration** (`src/server.ts`)
- ✅ `scheduled()` export added to handle Cloudflare Workers cron triggers
- ✅ Properly integrated with TanStack Start
- ✅ Uses `ctx.waitUntil()` for background processing

### 3. **Cron Triggers** (`wrangler.jsonc`)
- ✅ Hourly sync: `0 * * * *` (every hour on the hour)
- ✅ Weekly cleanup: `0 2 * * 7` (Sunday at 2:00 AM)
- ✅ KV namespace binding configured

### 4. **iCal Service** (`src/lib/ical-service.ts`)
- ✅ Calendar parsing and event extraction
- ✅ Room availability updates
- ✅ Sync logging to database
- ✅ Support for both Airbnb and Expedia

### 5. **Admin Dashboard** (`src/routes/admin/property-management/$roomId.tsx`)
- ✅ Manual sync buttons for testing
- ✅ iCal URL configuration
- ✅ Sync status display
- ✅ Last sync timestamps

## 🚀 Deployment Steps

### Step 1: Verify Environment Variables

Make sure all required secrets are set in Cloudflare:

```bash
# Check existing secrets
wrangler secret list

# If any are missing, add them:
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_TRPC_WEBHOOK_SECRET
```

### Step 2: Build and Deploy

```bash
# Build the project
pnpm run build

# Deploy to Cloudflare Workers
pnpm run deploy
```

### Step 3: Verify Deployment

After deployment, check that cron triggers are active:

```bash
wrangler deployments list
```

You should see your cron schedules listed in the deployment info.

### Step 4: Test the Cron Jobs

#### Option A: Use the Test Script
```bash
./scripts/test-cron-jobs.sh
```

Select option 6 for a full test suite.

#### Option B: Manual Testing
```bash
# Tail logs
wrangler tail

# In another terminal, trigger manually via Cloudflare dashboard
# or wait for the next hour to see automatic execution
```

#### Option C: Test from Admin Dashboard
1. Go to `/admin/property-management`
2. Edit a room that has Airbnb or Expedia URLs configured
3. Click the "Sync" button
4. Verify sync status updates

## 📊 How to Monitor

### View Sync Logs in Database

```bash
# Recent syncs
wrangler d1 execute irishette-dev --command="
  SELECT id, roomId, platform, status, bookingsProcessed, syncDuration, createdAt 
  FROM ical_sync_log 
  ORDER BY createdAt DESC 
  LIMIT 20;
" --remote

# Sync statistics
wrangler d1 execute irishette-dev --command="
  SELECT 
    platform,
    COUNT(*) as total_syncs,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
    AVG(syncDuration) as avg_duration_ms
  FROM ical_sync_log
  WHERE createdAt > datetime('now', '-7 days')
  GROUP BY platform;
" --remote
```

### View KV Sync Summaries

```bash
# List recent summaries
wrangler kv key list --namespace-id="481a64572c1145de958404c9512755d6" --prefix="sync_summary:"

# Get specific summary
wrangler kv key get --namespace-id="481a64572c1145de958404c9512755d6" "sync_summary:1696291200000"
```

### Live Logs

```bash
# Tail production logs
wrangler tail --format pretty

# Filter for scheduled events
wrangler tail | grep "Scheduled"
```

## 🎯 Expected Behavior

### Hourly Sync (0 * * * *)
1. Fetches all active rooms with external calendar URLs
2. For each room:
   - Fetches iCal feed from Airbnb (if configured)
   - Fetches iCal feed from Expedia (if configured)
   - Parses events and blocks dates in `room_availability` table
   - Logs sync results to `ical_sync_log` table
   - Updates `lastAirbnbSync` or `lastExpediaSync` timestamp
3. Stores summary in KV storage (expires after 7 days)

### Weekly Cleanup (0 2 * * 7)
- Runs every Sunday at 2:00 AM
- Currently logs cleanup intent (placeholder for future implementation)
- Can be extended to delete old sync logs, expired bookings, etc.

## 📝 What to Expect in Logs

### Successful Sync
```
🚀 Starting scheduled calendar sync... 2025-10-02T12:00:00.000Z
📋 Found 3 active rooms to sync
🏠 Processing room: rose-room (abc123)
  📥 Syncing Airbnb calendar...
  ✅ Airbnb sync successful: 5 bookings processed
🎉 Calendar sync completed:
  📊 Total rooms: 3
  🔄 Sync attempts: 6
  ✅ Successful: 6
  ❌ Errors: 0
📝 Sync summary stored in KV: sync_summary:1696291200000
```

### Failed Sync
```
🏠 Processing room: rose-room (abc123)
  📥 Syncing Airbnb calendar...
  ❌ Airbnb sync failed: Failed to fetch calendar: 404 Not Found
```

## 🔧 Troubleshooting

### Cron Jobs Not Running

**Check:**
1. Worker is deployed: `wrangler deployments list`
2. Cron triggers are configured in `wrangler.jsonc`
3. Worker logs for errors: `wrangler tail`

**Fix:**
```bash
# Redeploy
pnpm run deploy
```

### Sync Errors

**Check:**
1. External calendar URLs are valid
2. URLs are accessible (test in browser or with curl)
3. Check error messages in `ical_sync_log` table

**Fix:**
- Update iCal URLs in admin dashboard
- Test URLs using the "Test" button
- Manually trigger sync to see detailed error

### Database Conflicts

If you see "UNIQUE constraint failed" errors:

**Cause:** Room availability records already exist for those dates

**Fix:** Already handled! The code uses `onConflictDoUpdate()` to update existing records.

## 🎨 Admin Dashboard Features

Your admin dashboard at `/admin/property-management/$roomId` includes:

- **Configure iCal URLs**: Add/edit Airbnb and Expedia calendar URLs
- **Test URLs**: Validate iCal feeds before saving
- **Manual Sync**: Trigger sync on-demand for testing
- **Sync Status**: View last sync time for each platform
- **Export Calendar**: Copy iCal URL to share with external platforms

## 📚 Related Documentation

- [CRON_JOBS_SETUP.md](./CRON_JOBS_SETUP.md) - Detailed cron job documentation
- [ICAL_SYNC_README.md](./ICAL_SYNC_README.md) - iCal service implementation
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## ✨ Next Steps (Optional Enhancements)

1. **Add Alerting**: Send email/Slack notifications on sync failures
2. **Monitoring Dashboard**: Create admin page to view sync history
3. **Webhook Support**: Real-time sync instead of hourly polling
4. **Two-way Sync**: Export local bookings to external calendars
5. **Smart Sync**: Only sync rooms with recent changes
6. **Retry Logic**: Automatic retry on transient failures

## 🎉 You're All Set!

Your automated calendar syncing is now configured and ready to go. Simply deploy and your rooms will automatically sync with Airbnb and Expedia every hour!

```bash
# Deploy now
pnpm run deploy

# Watch it work
wrangler tail
```

---

**Questions or Issues?**
- Check the logs: `wrangler tail`
- Review sync history in database
- Test manually from admin dashboard
- Refer to [CRON_JOBS_SETUP.md](./CRON_JOBS_SETUP.md) for detailed troubleshooting

**Last Updated**: October 2, 2025
