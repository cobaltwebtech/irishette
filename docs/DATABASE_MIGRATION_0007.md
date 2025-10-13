# Database Migration: room_availability Schema Change

## Migration: 0007_irishette-migration.sql

### Overview
Changed `room_availability` table from storing individual blocked dates to storing booking periods with check-in and check-out dates.

### Problem Solved
The previous schema with a single `date` column couldn't handle overlapping bookings on the same day (e.g., one guest checking out while another checks in).

### Schema Changes

**Before:**
```sql
CREATE TABLE room_availability (
  id text PRIMARY KEY,
  room_id text NOT NULL,
  date text NOT NULL,  -- Single date column
  -- ... other columns
  UNIQUE(room_id, date)  -- Prevented overlapping bookings
);
```

**After:**
```sql
CREATE TABLE room_availability (
  id text PRIMARY KEY,
  room_id text NOT NULL,
  check_in_date text NOT NULL,  -- Start of booking period
  check_out_date text NOT NULL,  -- End of booking period
  -- ... other columns
  -- No unique constraint - allows multiple bookings per room
);
```

### Migration Strategy

Since SQLite doesn't support `ALTER COLUMN` or adding `NOT NULL` columns without defaults, we use the recreate pattern:

1. **Create new table** with desired schema
2. **Copy existing data** - Each existing `date` becomes a one-day booking (check-in on that date, check-out next day)
3. **Drop old table**
4. **Rename new table** to original name
5. **Recreate indexes**

### Data Transformation

Existing single-date records are converted to one-day bookings:
```sql
-- Old record: date = '2025-10-13'
-- New record: check_in_date = '2025-10-13', check_out_date = '2025-10-14'
```

This is safe because:
- The old schema blocked individual dates
- Converting to one-day bookings preserves the same blocking behavior
- The iCal sync will immediately update to correct multi-day bookings on next run

### Breaking Changes

⚠️ **API Changes Required:**

Any code that queries `room_availability` needs updates:

**Before:**
```typescript
// Old query
await db.select()
  .from(roomAvailability)
  .where(eq(roomAvailability.date, '2025-10-13'));
```

**After:**
```typescript
// New query - find bookings overlapping a specific date
await db.select()
  .from(roomAvailability)
  .where(
    and(
      lte(roomAvailability.checkInDate, '2025-10-13'),
      gt(roomAvailability.checkOutDate, '2025-10-13')
    )
  );
```

### Files Updated

1. **Schema:** `src/db/room-schema.ts`
   - Replaced `date` with `checkInDate` and `checkOutDate`
   - Removed unique constraint on `(roomId, date)`
   - Added indexes for both date columns

2. **iCal Service:** `src/lib/ical-service.ts`
   - Refactored to work with booking periods instead of individual dates
   - Changed detection now compares entire bookings, not individual dates
   - Reduced database writes (one record per booking instead of one per date)

### Benefits

1. **Supports same-day turnover:** Guest A checks out Oct 13, Guest B checks in Oct 13
2. **Reduced database records:** One record per booking instead of one per occupied night
3. **Simpler data model:** Booking periods match how calendars actually work
4. **Better performance:** Fewer records to insert/update during sync

### Testing After Migration

```bash
# 1. Run the migration
wrangler d1 migrations apply irishette-dev

# 2. Verify the schema
wrangler d1 execute irishette-dev --command="
  SELECT name, type FROM sqlite_master 
  WHERE name LIKE 'room_availability%' 
  ORDER BY name;
"

# 3. Check existing data was migrated
wrangler d1 execute irishette-dev --command="
  SELECT 
    id, 
    room_id, 
    check_in_date, 
    check_out_date, 
    source 
  FROM room_availability 
  LIMIT 5;
"

# 4. Run a sync to update with real booking data
# (Go to admin dashboard and sync a room's calendar)
```

### Rollback Strategy

If you need to rollback:

1. **Backup your data** before migration
2. **Restore from backup** if issues occur
3. **Or create reverse migration:**

```sql
-- Reverse migration (expand bookings back to individual dates)
CREATE TABLE room_availability_old AS 
SELECT 
  room_id,
  check_in_date as date,
  -- ... other columns
FROM room_availability;

-- Drop new table and rename
DROP TABLE room_availability;
ALTER TABLE room_availability_old RENAME TO room_availability;
```

### Production Deployment Checklist

- [ ] Backup database before migration
- [ ] Run migration on dev/staging first
- [ ] Update application code (already done)
- [ ] Run migration on production
- [ ] Verify no errors in migration output
- [ ] Test: Sync one room's calendar
- [ ] Test: Create a manual booking
- [ ] Test: Check room availability calendar displays correctly
- [ ] Monitor logs for any query errors

### Next Steps

After migration is complete:
1. Deploy updated application code
2. Run iCal sync for all rooms to update with accurate booking periods
3. Remove any old code that referenced the `date` column
4. Update any dashboards or reports that query room_availability

## Related Documentation

- Schema: `src/db/room-schema.ts`
- iCal Service: `src/lib/ical-service.ts`
- Testing: `docs/TESTING_GUIDE.md`
