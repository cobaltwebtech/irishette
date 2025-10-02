# 🧪 Testing Cron Jobs in Development

## TL;DR - Quick Test

```bash
# Terminal 1: Start dev server
wrangler dev

# Terminal 2: Trigger sync
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# Or use the helper script
./scripts/test-cron-local.sh
```

## Step-by-Step Testing

### 1️⃣ Start Dev Server

```bash
cd /Users/cgarza/GitHub-Repos/irishette
wrangler dev
```

You should see:
```
⛅️ wrangler 4.41.0
-------------------
wrangler dev now uses local mode by default...
Your worker is listening on http://localhost:8787
```

### 2️⃣ Trigger the Cron Job

**Option A: Use the helper script** (Easiest)
```bash
./scripts/test-cron-local.sh
```

**Option B: Use curl directly**
```bash
# Trigger hourly calendar sync
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# Trigger weekly cleanup
curl "http://localhost:8787/__scheduled?cron=0+2+*+*+7"
```

**Option C: Use your browser**
```
http://localhost:8787/__scheduled?cron=0+*+*+*+*
```

### 3️⃣ Watch the Logs

In your `wrangler dev` terminal, you should see:

```
⏰ Scheduled event triggered: 0 * * * *
🔔 Scheduled event received in server.ts
🚀 Starting scheduled calendar sync... 2025-10-02T14:30:00.000Z
📋 Found 3 active rooms to sync
🏠 Processing room: rose-room (abc-123-def-456)
  📥 Syncing Airbnb calendar...
  ✅ Airbnb sync successful: 5 bookings processed
  📥 Syncing Expedia calendar...
  ✅ Expedia sync successful: 3 bookings processed
🎉 Calendar sync completed:
  📊 Total rooms: 3
  🔄 Sync attempts: 6
  ✅ Successful: 6
  ❌ Errors: 0
📝 Sync summary stored in KV: sync_summary:1696291200000
```

### 4️⃣ Verify Results

**Check Database:**
```bash
wrangler d1 execute irishette-dev \
  --command="SELECT * FROM ical_sync_log ORDER BY createdAt DESC LIMIT 5;" \
  --local
```

**Check KV Storage:**
```bash
wrangler kv key list \
  --namespace-id="481a64572c1145de958404c9512755d6" \
  --prefix="sync_summary:"
```

**Check Room Availability:**
```bash
wrangler d1 execute irishette-dev \
  --command="SELECT * FROM room_availability WHERE isBlocked = true ORDER BY date DESC LIMIT 10;" \
  --local
```

## Common Scenarios

### Test Empty Database
```bash
# If you have no rooms, you'll see:
📋 Found 0 active rooms to sync
```

**Fix:** Add a room via `/admin/property-management`

### Test Without iCal URLs
```bash
# If rooms have no iCal URLs:
🏠 Processing room: rose-room (abc-123)
  (no external calendars configured)
```

**Fix:** Add Airbnb/Expedia URLs in the admin dashboard

### Test Invalid iCal URL
```bash
# If URL is invalid:
  📥 Syncing Airbnb calendar...
  ❌ Airbnb sync failed: Failed to fetch calendar: 404 Not Found
```

**Fix:** Update the URL or use the "Test" button in admin

## Debugging Tips

### Enable Verbose Logging

The scheduled tasks already have detailed console.log statements. Just watch your `wrangler dev` terminal.

### Test Individual Components

**Test iCal parsing:**
```typescript
// In your admin dashboard, use the "Test" button
// on the iCal configuration for each room
```

**Test database writes:**
```bash
wrangler d1 execute irishette-dev \
  --command="SELECT COUNT(*) FROM room_availability WHERE source IN ('airbnb', 'expedia');" \
  --local
```

### Check Environment Variables

Make sure your `.dev.vars` file exists with:
```bash
BETTER_AUTH_SECRET=your-secret-here
RESEND_API_KEY=re_xxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_TRPC_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

## Production Testing

### Test with Remote Database

```bash
# Uses production database but local code
wrangler dev --remote

# Then trigger
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

⚠️ **Warning:** This writes to production database!

### View Production Logs

```bash
# Deploy first
pnpm run deploy

# Then tail logs
wrangler tail

# Wait for next hour, or trigger manually from Cloudflare dashboard
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot read property 'DB'` | Check `.dev.vars` has all required secrets |
| `KV_ICAL_SYNC_LOG not defined` | Verify KV namespace in `wrangler.jsonc` |
| No rooms found | Create rooms in admin dashboard |
| Failed to fetch calendar | Verify iCal URLs are valid |
| Dev server not responding | Restart `wrangler dev` |

## Quick Reference

```bash
# Start dev server
wrangler dev

# Trigger sync (in another terminal)
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# Or use helper script
./scripts/test-cron-local.sh

# Check logs
# (watch wrangler dev terminal)

# Verify database
wrangler d1 execute irishette-dev --command="SELECT * FROM ical_sync_log LIMIT 5;" --local

# Deploy to production
pnpm run deploy

# Watch production logs
wrangler tail
```

## Next Steps

1. ✅ Test locally with the steps above
2. ✅ Verify sync logs are created
3. ✅ Check room availability is updated
4. ✅ Deploy to production: `pnpm run deploy`
5. ✅ Monitor production logs: `wrangler tail`

---

**Pro Tip:** Keep one terminal with `wrangler dev` running and another for triggering tests. This makes iteration much faster!
