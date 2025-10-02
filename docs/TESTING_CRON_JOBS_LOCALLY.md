# Testing Cron Jobs in Local Development

## ⚠️ Important Note for TanStack Start

TanStack Start applications handle routing differently than plain Cloudflare Workers. The `__scheduled` endpoint isn't directly accessible in dev mode. Instead, use these methods:

## Quick Test Guide

### Method 1: Test via Admin Dashboard (Easiest) ✅

The easiest way to test the sync logic is through the admin interface:

1. **Start dev server:**
```bash
pnpm dev
# or
wrangler dev
```

2. **Go to the admin dashboard:**
   - Navigate to `http://localhost:8787/admin/property-management`
   - Click on a room that has Airbnb or Expedia iCal URLs configured
   - Click the "Sync" button next to the platform you want to test
   - Watch the console logs in your dev server terminal

This tests the **exact same code** that the cron job uses (`iCalService.syncExternalCalendar`).

### Method 2: Test in Production (Recommended for Full Cron Testing) 

Since the scheduled handler only works properly after deployment:

```bash
# Build and deploy
pnpm run build
pnpm run deploy

# Then tail logs to see the hourly sync
wrangler tail

# You'll see the cron trigger every hour automatically
```

### Method 3: Manual Trigger via Cloudflare Dashboard

1. Deploy your app: `pnpm run deploy`
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Navigate to Workers & Pages > Your Worker > Triggers
4. Click "Trigger Cron" next to the schedule you want to test
5. Watch logs with `wrangler tail`

## Testing Steps

### 1. Ensure you have test data

Make sure you have:
- At least one active room in your database
- That room has an Airbnb or Expedia iCal URL configured

You can add this via the admin dashboard:
- Go to `/admin/property-management`
- Edit a room
- Add an Airbnb or Expedia iCal URL
- Click "Test" to verify the URL works

### 2. Start the dev server

```bash
# Terminal 1
cd /Users/cgarza/GitHub-Repos/irishette
wrangler dev
```

### 3. Trigger the sync

```bash
# Terminal 2
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

### 4. Check the output

You should see logs like:
```
⏰ Scheduled event triggered: 0 * * * *
🔔 Scheduled event received in server.ts
🚀 Starting scheduled calendar sync... 2025-10-02T...
📋 Found 3 active rooms to sync
🏠 Processing room: rose-room (abc-123)
  📥 Syncing Airbnb calendar...
  ✅ Airbnb sync successful: 5 bookings processed
🎉 Calendar sync completed:
  📊 Total rooms: 3
  🔄 Sync attempts: 3
  ✅ Successful: 3
  ❌ Errors: 0
```

## Advanced Testing

### Test with specific cron patterns

```bash
# Test hourly sync
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# Test weekly cleanup
curl "http://localhost:8787/__scheduled?cron=0+2+*+*+7"

# Test at a specific time (optional, any valid cron pattern works)
curl "http://localhost:8787/__scheduled?cron=30+14+*+*+*"
```

### Using httpie (if installed)

```bash
# Install httpie (optional)
brew install httpie

# Then use it for nicer formatting
http "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

### Using Postman or Thunder Client

Create a GET request to:
```
http://localhost:8787/__scheduled?cron=0+*+*+*+*
```

## Verify Results

### Check Database

```bash
# View recent sync logs
wrangler d1 execute irishette-dev --command="
  SELECT * FROM ical_sync_log 
  ORDER BY createdAt DESC 
  LIMIT 5;
" --local
```

### Check KV Storage

```bash
# List sync summaries
wrangler kv key list --namespace-id="481a64572c1145de958404c9512755d6" --prefix="sync_summary:"
```

### Check Room Availability

```bash
# View blocked dates for a room
wrangler d1 execute irishette-dev --command="
  SELECT * FROM room_availability 
  WHERE roomId = 'YOUR_ROOM_ID' 
    AND isBlocked = true 
  ORDER BY date DESC 
  LIMIT 10;
" --local
```

## Common Issues

### Issue: "Cannot read property 'DB' of undefined"

**Solution:** Make sure your `.dev.vars` file has the required environment variables:
```
BETTER_AUTH_SECRET=your-secret
RESEND_API_KEY=your-key
STRIPE_SECRET_KEY=your-key
STRIPE_TRPC_WEBHOOK_SECRET=your-webhook-secret
```

### Issue: "KV_ICAL_SYNC_LOG is not defined"

**Solution:** KV namespaces need to be bound. Check `wrangler.jsonc` has:
```jsonc
"kv_namespaces": [
  {
    "binding": "KV_ICAL_SYNC_LOG",
    "id": "481a64572c1145de958404c9512755d6"
  }
]
```

### Issue: No rooms found

**Solution:** Create test data:
1. Go to `/admin/property-management`
2. Create a room or make sure existing rooms are active
3. Add iCal URLs to the rooms

### Issue: "Failed to fetch calendar"

**Solution:** 
- Verify the iCal URL is valid
- Test it in your browser or with curl
- Use the "Test" button in the admin dashboard

## Quick One-Liner Test

```bash
# Start dev server and trigger sync in one command
wrangler dev & sleep 3 && curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

## Production-Like Testing

To test with production data (safely):

```bash
# Use remote database but local code
wrangler dev --remote

# Then trigger the sync
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

⚠️ **Warning:** This will sync against your production database, so blocked dates will be created in production!

---

**Pro Tip:** Keep `wrangler dev` running in one terminal and trigger syncs from another terminal window for easier testing!
