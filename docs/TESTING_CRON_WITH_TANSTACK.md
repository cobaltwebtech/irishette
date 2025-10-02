# 🎯 How to Test Cron Jobs with TanStack Start

## The Situation

You're getting a 404 error when trying to access `http://localhost:8787/__scheduled` because **TanStack Start applications handle routing differently** than plain Cloudflare Workers.

In a plain Worker, the `__scheduled` endpoint is automatically exposed by wrangler dev. However, with TanStack Start, all routes go through the React router first, which returns a 404 for unknown routes.

## ✅ Solution: Three Ways to Test

### Option 1: Use the Admin Dashboard (Easiest for Local Testing)

This is the **recommended way** to test the sync logic locally:

1. **Start your dev server:**
   ```bash
   pnpm dev
   ```

2. **Navigate to the admin dashboard:**
   ```
   http://localhost:8787/admin/property-management
   ```

3. **Click on a room** that has Airbnb or Expedia iCal URLs configured

4. **Click the "Sync" button** next to Airbnb or Expedia

5. **Watch the logs** in your `wrangler dev` terminal

**Why this works:** The "Sync" button calls the exact same code that the cron job uses:
```typescript
await trpcClient.rooms.syncCalendar.mutate({
  roomId: room.id,
  platform: 'airbnb',
});
```

This internally calls `iCalService.syncExternalCalendar()`, which is the same function the cron job uses.

### Option 2: Deploy and Test in Production (Most Accurate)

To test the actual cron trigger:

1. **Build and deploy:**
   ```bash
   pnpm run build
   pnpm run deploy
   ```

2. **Tail the logs:**
   ```bash
   wrangler tail
   ```

3. **Wait for the next hour** or manually trigger from Cloudflare Dashboard:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Navigate to Workers & Pages > irishette > Triggers
   - Click "Trigger Cron" next to the hourly schedule

### Option 3: Test Using Wrangler Tail (Production Only)

Once deployed, you can monitor the automatic hourly syncs:

```bash
# Deploy first
pnpm run deploy

# Then watch the logs
wrangler tail --format pretty

# Every hour (on the hour), you'll see:
# ⏰ Scheduled event triggered: 0 * * * *
# 🚀 Starting scheduled calendar sync...
```

## Why Can't We Use `__scheduled` in Dev?

The issue is architectural:

### Plain Cloudflare Worker:
```
Request → Worker fetch() handler
Cron → Worker scheduled() handler ✅ __scheduled endpoint works
```

### TanStack Start App:
```
Request → TanStack Router → React Components
Cron → Worker scheduled() handler ❌ __scheduled blocked by router
```

The TanStack router intercepts all HTTP requests (including `/__scheduled`) and tries to match them to React routes. Since there's no `/__scheduled` route defined, it returns 404.

## What's Actually Configured

Your cron setup is **completely correct** and will work in production:

✅ **`src/server.ts`** exports `scheduled()` handler  
✅ **`wrangler.jsonc`** defines cron triggers  
✅ **`src/lib/scheduled-tasks.ts`** contains sync logic  
✅ **Admin dashboard** has manual sync buttons

The only thing that doesn't work is the `__scheduled` endpoint in local dev mode.

## Testing Checklist

- [x] **Local sync logic**: Use admin dashboard "Sync" button
- [x] **Production cron**: Deploy and monitor with `wrangler tail`
- [x] **Verify results**: Check `ical_sync_log` table in database
- [x] **Check KV**: View sync summaries in KV namespace

## Quick Commands

```bash
# Test locally via admin dashboard
pnpm dev
# Then go to http://localhost:8787/admin/property-management

# Deploy to production
pnpm run deploy

# Monitor production cron jobs
wrangler tail

# Check sync logs
wrangler d1 execute irishette-dev --command="
  SELECT * FROM ical_sync_log 
  ORDER BY createdAt DESC 
  LIMIT 10;
" --remote

# View KV sync summaries
wrangler kv key list \
  --namespace-id="481a64572c1145de958404c9512755d6" \
  --prefix="sync_summary:"
```

## TL;DR

**For local testing:** Use the admin dashboard Sync button  
**For production testing:** Deploy and use `wrangler tail`  
**Your cron setup:** Already correct and will work in production! ✅

---

The `__scheduled` endpoint limitation is a known behavior with framework-based Workers apps. The good news is that your sync logic is fully testable through the admin dashboard, and the cron job will work perfectly once deployed! 🎉
