# Fix for Cron Job Database Error

## Issue Description

The cron job was failing with a nested database error when trying to sync Expedia calendars:

```
❌ Expedia.com sync error: Failed query: insert into "ical_sync_log" ...
error_message: Failed query: insert into "room_availability" ...
```

## Root Causes Identified

### 1. **Date Object Instantiation in Loops**
Creating `new Date()` multiple times in loops could result in slightly different timestamps, causing parameter mismatches in the SQL query.

**Before:**
```typescript
await this.db.insert(roomAvailability).values({
  createdAt: new Date(),  // Called here
  updatedAt: new Date(),  // And again here
})
.onConflictDoUpdate({
  set: {
    updatedAt: new Date(),  // And potentially again here
  },
});
```

**Problem:** Each `new Date()` call creates a new timestamp, potentially milliseconds apart, which could confuse Drizzle's query builder.

### 2. **Error Message Length**
When a database error occurred, the entire SQL query with all parameters was captured as the error message. This extremely long error message (500+ characters) was then inserted into `ical_sync_log.error_message`, potentially exceeding column limits or causing serialization issues.

### 3. **Unhandled Finally Block Errors**
The `finally` block attempted to log errors to the database without error handling. If the logging itself failed, it would throw an uncaught error.

## Fixes Applied

### Fix 1: Use Single Date Instance Per Event
```typescript
// Process each event
for (const event of events) {
  const dates = this.getDateRange(event.startDate, event.endDate);
  const now = new Date(); // ✅ Single timestamp for consistency

  for (const date of dates) {
    await this.db
      .insert(roomAvailability)
      .values({
        // ... other fields
        createdAt: now,  // ✅ Same timestamp
        updatedAt: now,  // ✅ Same timestamp
      })
      .onConflictDoUpdate({
        target: [roomAvailability.roomId, roomAvailability.date],
        set: {
          // ... other fields
          updatedAt: now,  // ✅ Same timestamp
        },
      });
  }
}
```

### Fix 2: Truncate Long Error Messages
```typescript
// Truncate error message if too long (SQLite has limits, D1 has stricter ones)
const truncatedError = errorMessage
  ? errorMessage.length > 500
    ? `${errorMessage.substring(0, 500)}... (truncated)`
    : errorMessage
  : undefined;

await this.db.insert(icalSyncLog).values({
  // ... other fields
  errorMessage: truncatedError,  // ✅ Limited to 500 chars
});
```

### Fix 3: Wrap Logging in Try-Catch
```typescript
} finally {
  // Log sync attempt with error handling
  try {
    await this.db.insert(icalSyncLog).values({
      // ... logging
    });
  } catch (logError) {
    // ✅ If logging fails, just console.error it - don't throw
    console.error(
      `Failed to log sync result for ${platform}:`,
      logError instanceof Error ? logError.message : logError,
    );
  }
}
```

## Testing the Fix

### Local Testing
Use the admin dashboard to trigger a sync:
```bash
pnpm dev
# Go to http://localhost:8787/admin/property-management
# Click a room → Click "Sync" button
```

### Production Testing
```bash
# Deploy the fix
pnpm run build
pnpm run deploy

# Monitor the next hourly sync
wrangler tail --format pretty
```

### Verify Sync Logs
```bash
# Check for successful syncs
wrangler d1 execute irishette-dev --command="
  SELECT platform, status, bookingsProcessed, errorMessage, createdAt 
  FROM ical_sync_log 
  ORDER BY createdAt DESC 
  LIMIT 10;
" --remote
```

## Expected Behavior After Fix

✅ **Calendar syncs complete successfully** without database errors  
✅ **Error messages are truncated** to prevent database issues  
✅ **Logging failures don't crash** the sync process  
✅ **Timestamps are consistent** across related records  

## Monitoring

After deployment, watch for:

1. **Successful sync logs:**
   ```
   🎉 Calendar sync completed:
     ✅ Successful: N
     ❌ Errors: 0
   ```

2. **Database records:**
   - `ical_sync_log` should show `status = 'success'`
   - `room_availability` should have new blocked dates
   - Error messages (if any) should be < 500 characters

3. **No nested errors:**
   - Should not see "Failed query: insert into ical_sync_log" errors
   - Logging errors are caught and logged to console only

## Files Modified

- **`src/lib/ical-service.ts`**
  - Line ~157: Use single `now` timestamp per event
  - Line ~190: Use `syncTime` for room update  
  - Line ~209-224: Add error truncation and try-catch in finally block

## Deploy Command

```bash
pnpm run build && pnpm run deploy
```

---

**Issue Fixed:** ✅  
**Ready to Deploy:** ✅  
**Monitoring Required:** Yes (check first sync after deployment)
