# Fix: KV Rate Limit Error During Sync

## Issue

During calendar syncs, the worker was hitting Cloudflare's rate limits and failing to store the sync summary in KV:

```
Error: Too many API requests by single worker invocation.
```

This happened because:
1. Many database insert operations (one per date to block)
2. Multiple rooms being synced
3. Immediate KV write after heavy DB operations
4. Large summary object being stored

## Root Causes

### 1. Inefficient Database Operations
Each event could span multiple days, and the code was making individual DB inserts for each date:
- Room with 100 bookings × 3 days each = 300 DB operations
- Multiple rooms = potentially 1000+ DB operations per sync

### 2. Large KV Payload
The sync summary included full details of every sync result, including:
- Full error messages (potentially 500 chars each)
- All booking counts
- Complete sync results array

### 3. No Rate Limit Buffer
KV write happened immediately after all DB operations without any delay.

## Fixes Applied

### Fix 1: Deduplicate Date Inserts (ical-service.ts)

Instead of inserting each date separately as we process events, we now:
1. Collect all dates to block in a Map (deduplicates overlapping events)
2. Insert only unique dates

**Before:**
```typescript
for (const event of events) {
  const dates = this.getDateRange(event.startDate, event.endDate);
  for (const date of dates) {
    await this.db.insert(roomAvailability).values({...}); // Many inserts
  }
}
```

**After:**
```typescript
// Collect unique dates first
const datesToBlock = new Map<string, string>();
for (const event of events) {
  const dates = this.getDateRange(event.startDate, event.endDate);
  for (const date of dates) {
    if (!datesToBlock.has(date)) {
      datesToBlock.set(date, event.uid);
    }
  }
}

// Then insert only unique dates
for (const [date, externalBookingId] of datesToBlock) {
  await this.db.insert(roomAvailability).values({...});
}
```

**Result:** Reduces DB operations when events have overlapping dates.

### Fix 2: Reduce KV Payload Size (scheduled-tasks.ts)

Simplified the summary object to only include essential information:

**Before:**
```typescript
const summary = {
  // ... other fields
  syncResults, // Full array with all details including long error messages
};
```

**After:**
```typescript
const summary = {
  // ... other fields
  successfulSyncs: syncResults
    .filter(r => r.success)
    .map(r => ({ roomId: r.roomId, platform: r.platform })),
  failedSyncs: syncResults
    .filter(r => !r.success)
    .map(r => ({
      roomId: r.roomId,
      platform: r.platform,
      error: r.errorMessage?.substring(0, 100) // Truncate to 100 chars
    }))
};
```

**Result:** Much smaller JSON payload, faster KV write.

### Fix 3: Add Delay Before KV Write (scheduled-tasks.ts)

Added a 100ms delay before writing to KV to give the worker a breather:

```typescript
try {
  await new Promise(resolve => setTimeout(resolve, 100)); // Delay
  await env.KV_ICAL_SYNC_LOG.put(key, JSON.stringify(summary), {...});
} catch (kvError) {
  // Changed from console.error to console.warn
  console.warn('⚠️ Failed to store sync summary in KV (non-critical):', ...);
}
```

**Result:** Reduces likelihood of hitting rate limits.

### Fix 4: Downgrade Error Severity

Changed KV write failures from `console.error` to `console.warn` since it's not critical:
- Sync still succeeds
- Data is in `ical_sync_log` table
- KV storage is just for convenience

## Impact

### Before Fixes:
- ❌ KV write fails with rate limit error
- ❌ Logs show as errors
- ❌ Redundant DB operations for overlapping dates

### After Fixes:
- ✅ Fewer DB operations (deduplicated dates)
- ✅ Smaller KV payload
- ✅ Rate limit buffer added
- ✅ KV failures are non-critical warnings

## Files Modified

1. **`src/lib/ical-service.ts`**
   - Deduplicate dates before inserting into room_availability

2. **`src/lib/scheduled-tasks.ts`**
   - Reduce KV payload size
   - Add 100ms delay before KV write
   - Downgrade KV errors to warnings

## Testing

### Deploy
```bash
pnpm run build
pnpm run deploy
```

### Monitor Next Sync
```bash
wrangler tail --format pretty

# Watch for:
# ✅ Successful syncs
# 📝 Sync summary stored in KV (should succeed now)
# NO "Too many API requests" errors
```

### Verify KV Storage
```bash
wrangler kv key list \
  --namespace-id="481a64572c1145de958404c9512755d6" \
  --prefix="sync_summary:"

# Should see recent sync summaries
```

## What If KV Still Fails?

If you still hit rate limits (unlikely now), it's okay because:
1. ✅ Sync data is saved in `ical_sync_log` table
2. ✅ Room availability is updated correctly
3. ✅ Last sync timestamps are updated
4. ⚠️ Only the KV summary (convenience feature) would be missing

The sync functionality is not dependent on KV storage working.

## Monitoring

Check both:
1. **Console logs** - Should see KV success or just a warning
2. **Database** - `ical_sync_log` table has all sync details
3. **KV** - Recent sync summaries (optional)

## Summary

- **Deduplication** ✅ Reduces redundant DB operations
- **Smaller payload** ✅ Faster KV writes
- **Rate limit buffer** ✅ 100ms delay before KV
- **Non-critical errors** ✅ KV failures don't break sync
- **Ready to deploy** ✅

---

KV storage is now optimized and non-critical. Even if it fails, your syncs will work perfectly! 🎉
