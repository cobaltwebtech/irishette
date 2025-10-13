# Bug Fix: Past Events Filter Issue

## Problem

After implementing event filtering optimization, "Reserved" events were not being written to the database. The logs showed:

```
📅 Parsed 6 events from airbnb calendar
⏭️ Skipping past event: Reserved (2025-10-13 - 2025-10-17)
🔍 Filtered events: 0 relevant, 6 skipped (5 unavailable, 1 past)
```

**Issue:** A reservation that started TODAY (Oct 13, 2025) and ended in the future (Oct 17, 2025) was being incorrectly filtered as a "past event".

## Root Cause

The filtering logic was checking if the **event START date** was in the past:

```typescript
// WRONG: Skips events that started in the past, even if they're ongoing
const eventStartDate = new Date(event.startDate);
if (eventStartDate < now) {
  skippedPast++;
  continue;
}
```

This caused two problems:

1. **Current-day reservations were skipped** - An event starting today at midnight was being compared to "now" (also midnight), and edge cases with timezone/comparison were causing it to be filtered
2. **Ongoing reservations were skipped** - A guest who checked in yesterday and checks out tomorrow would be skipped entirely, leaving the room appearing available

## Solution

### 1. Check Event END Date Instead

Changed the logic to skip events only if they have **ENDED** in the past:

```typescript
// CORRECT: Only skip events that have completely ended
const eventEndDate = new Date(event.endDate);
if (eventEndDate < now) {
  skippedPast++;
  console.log(`⏭️ Skipping past event: ${event.summary} (${event.startDate} - ${event.endDate})`);
  continue;
}
```

**Why this works:**
- ✅ Events ending today or later are processed (includes ongoing reservations)
- ✅ Events that ended yesterday or earlier are skipped (truly past events)
- ✅ Handles check-ins that happened in the past but check-outs are in the future

### 2. Filter Past Dates in Date Range Generation

Updated `getDateRange()` to only return dates from today onwards:

```typescript
private getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (start < end) {
    const dateStr = start.toISOString().split('T')[0];
    // Only include dates from today onwards
    if (start >= today) {
      dates.push(dateStr);
    }
    start.setDate(start.getDate() + 1);
  }

  return dates;
}
```

**Why this is important:**
- A guest who checked in 3 days ago and checks out in 2 days should only block the remaining 2 days
- We don't want to write past dates to the availability table
- Keeps the database clean and focused on future availability

## Examples

### Example 1: Current Day Reservation (Original Bug)
- **Event:** Reserved Oct 13 - Oct 17, 2025
- **Today:** Oct 13, 2025
- **Before Fix:** ❌ Skipped as "past event"
- **After Fix:** ✅ Processed, blocks Oct 13, 14, 15, 16

### Example 2: Ongoing Reservation
- **Event:** Reserved Oct 10 - Oct 15, 2025
- **Today:** Oct 13, 2025
- **Before Fix:** ❌ Skipped as "past event" (started Oct 10)
- **After Fix:** ✅ Processed, blocks Oct 13, 14 (only remaining days)

### Example 3: Truly Past Reservation
- **Event:** Reserved Oct 1 - Oct 5, 2025
- **Today:** Oct 13, 2025
- **Before Fix:** ✅ Correctly skipped
- **After Fix:** ✅ Still correctly skipped

### Example 4: Future Reservation
- **Event:** Reserved Oct 20 - Oct 25, 2025
- **Today:** Oct 13, 2025
- **Before Fix:** ✅ Processed
- **After Fix:** ✅ Still processed, blocks Oct 20, 21, 22, 23, 24

## Testing

### Test Case 1: Same-Day Check-In
1. Create a test reservation that starts TODAY
2. Run sync
3. ✅ Should see: `✅ Processing event: Reserved (2025-10-13 - 2025-10-17)`
4. ✅ Should create availability records for today and future days

### Test Case 2: Ongoing Reservation
1. Manually create a test reservation that started yesterday
2. Run sync
3. ✅ Should process the event
4. ✅ Should only block remaining days (today + future), not past days

### Test Case 3: Past Reservation
1. Use a reservation that ended yesterday
2. Run sync
3. ✅ Should skip: `⏭️ Skipping past event: Reserved (2025-10-01 - 2025-10-12)`

## Expected Log Output

**After the fix, for your AirBnB calendar:**

```
📅 Parsed 6 events from airbnb calendar for room biolbnhax7ZK9ctPpb2rq
✅ Processing event: Reserved (2025-10-13 - 2025-10-17)
⏭️ Skipping past event: Airbnb (Not available) (2025-10-11 - 2025-10-12)
🔍 Filtered events: 1 relevant, 5 skipped (4 unavailable, 1 past)
📊 Total dates to block: 4, Existing dates in DB: 0
📝 Changes detected: 4 additions, 0 updates, 0 removals
✅ Airbnb.com sync successful: 1 bookings processed
```

## Deployment

```bash
pnpm run build
pnpm run deploy
```

Then test the sync again - you should now see reservations being properly recorded to the database!

## Files Changed

- `src/lib/ical-service.ts`
  - Line ~189: Changed from checking `eventStartDate < now` to `eventEndDate < now`
  - Line ~78-95: Updated `getDateRange()` to filter past dates

## Related Issues

- This fix ensures the optimization goals (99.5% write reduction) are maintained
- Reservations are now correctly identified and processed
- Change detection still works - subsequent syncs with no changes will skip database writes
- Both Expedia and AirBnB platforms benefit from this fix
