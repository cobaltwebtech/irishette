# Cron Jobs Setup Documentation

## Overview

This document explains the automated scheduled tasks (cron jobs) setup for syncing room availability calendars with external services like Airbnb and Expedia.

## Architecture

The cron job system consists of three main components:

1. **`wrangler.jsonc`** - Defines the cron triggers
2. **`src/server.ts`** - Exports the scheduled event handler for Cloudflare Workers
3. **`src/lib/scheduled-tasks.ts`** - Contains the business logic for scheduled tasks

## Cron Schedule

Two scheduled tasks are configured:

### 1. Calendar Sync (Hourly)
- **Schedule**: `0 * * * *` (Every hour, on the hour)
- **Function**: `scheduledCalendarSync()`
- **Purpose**: Syncs external calendars from Airbnb and Expedia to block dates in the local system

### 2. Cleanup (Weekly)
- **Schedule**: `0 2 * * 7` (Every Sunday at 2:00 AM)
- **Function**: `scheduledCleanup()`
- **Purpose**: Removes old sync logs to prevent database bloat

## How It Works

### Calendar Sync Process

1. **Fetch Active Rooms**: Queries all active rooms from the database
2. **Process Each Room**: For each room with an external calendar URL:
   - Fetches the iCal feed from Airbnb/Expedia
   - Parses the iCal events
   - Updates `room_availability` table to block dates
   - Logs the sync result to `ical_sync_log` table
   - Updates room's `lastAirbnbSync` or `lastExpediaSync` timestamp
3. **Store Summary**: Saves sync summary to KV storage for monitoring
4. **Error Handling**: Catches and logs errors without stopping the entire sync

### Data Flow

```
External Calendar (Airbnb/Expedia)
         ↓
   Fetch iCal Feed
         ↓
   Parse Events
         ↓
 Update room_availability
         ↓
   Log to ical_sync_log
         ↓
Store Summary in KV (KV_ICAL_SYNC_LOG)
```

## Testing

### Local Testing (Development)

You can test the scheduled tasks locally using Wrangler:

```bash
# Test the hourly calendar sync
wrangler dev --test-scheduled --scheduled-only

# Or trigger a specific cron pattern
wrangler dev
# Then in another terminal:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

### Manual Trigger (Production)

To manually trigger a cron job in production:

```bash
# Trigger the hourly calendar sync
wrangler triggers deploy --cron "0 * * * *"

# Or use the Cloudflare dashboard:
# 1. Go to Workers & Pages
# 2. Select your worker
# 3. Go to Triggers tab
# 4. Click "Run" next to the cron trigger
```

### Testing via Cloudflare API

```bash
# Set your credentials
CLOUDFLARE_ACCOUNT_ID="your-account-id"
CLOUDFLARE_API_TOKEN="your-api-token"
WORKER_NAME="irishette"

# Trigger the cron manually
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/schedules" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"cron": "0 * * * *"}'
```

## Monitoring

### View Sync Logs

The sync results are stored in two places:

1. **KV Storage** (`KV_ICAL_SYNC_LOG`):
   - Key format: `sync_summary:{timestamp}`
   - TTL: 7 days
   - Contains: Summary of all syncs, success/error counts

2. **D1 Database** (`ical_sync_log` table):
   - Per-room sync logs
   - Fields: `roomId`, `platform`, `status`, `bookingsProcessed`, `errorMessage`, `syncDuration`

### Query Sync History

```sql
-- Recent sync logs
SELECT * FROM ical_sync_log 
ORDER BY createdAt DESC 
LIMIT 20;

-- Sync errors in last 24 hours
SELECT * FROM ical_sync_log 
WHERE status = 'error' 
  AND createdAt > datetime('now', '-1 day')
ORDER BY createdAt DESC;

-- Sync statistics by platform
SELECT 
  platform,
  COUNT(*) as total_syncs,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
  AVG(syncDuration) as avg_duration_ms
FROM ical_sync_log
WHERE createdAt > datetime('now', '-7 days')
GROUP BY platform;
```

### View KV Logs

```bash
# List recent sync summaries
wrangler kv key list --namespace-id="481a64572c1145de958404c9512755d6" --prefix="sync_summary:"

# Get a specific summary
wrangler kv key get --namespace-id="481a64572c1145de958404c9512755d6" "sync_summary:1696291200000"
```

## Logs and Debugging

### View Worker Logs

```bash
# Tail live logs in development
wrangler dev

# Tail production logs
wrangler tail

# Filter for scheduled events only
wrangler tail --status ok | grep "Scheduled event"
```

### Debug Checklist

If cron jobs aren't working:

1. ✅ **Verify Cron Triggers**: Check `wrangler.jsonc` has correct cron expressions
2. ✅ **Check Worker Deployment**: Ensure latest code is deployed
3. ✅ **Verify Environment Variables**: Check all required secrets are set
4. ✅ **Test Manually**: Trigger cron manually to see error messages
5. ✅ **Check KV Namespace**: Verify `KV_ICAL_SYNC_LOG` is bound correctly
6. ✅ **Review Logs**: Look for errors in Cloudflare dashboard logs

## Configuration

### Environment Variables

Required in production (set via `wrangler secret put`):

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_TRPC_WEBHOOK_SECRET
```

### Room Setup

For rooms to be synced, they must:

1. Be active (`isActive = true`)
2. Have at least one external calendar URL set:
   - `airbnbIcalUrl` for Airbnb
   - `expediaIcalUrl` for Expedia

### KV Namespace

The KV namespace binding must be set up:

```jsonc
// wrangler.jsonc
"kv_namespaces": [
  {
    "binding": "KV_ICAL_SYNC_LOG",
    "id": "481a64572c1145de958404c9512755d6"
  }
]
```

## Performance Considerations

### Rate Limiting

- 1-second delay between processing each platform's calendar
- Prevents overwhelming external APIs
- Total sync time = (number of rooms × number of platforms × 1 second) + processing time

### Optimization Tips

1. **Batch Updates**: Consider batching database inserts for better performance
2. **Parallel Processing**: Process rooms in parallel (with caution for API rate limits)
3. **Selective Sync**: Only sync rooms with recent bookings or changes
4. **Cache iCal Data**: Cache parsed iCal data to reduce processing

## Troubleshooting

### Common Issues

#### 1. Cron Not Triggering

**Symptoms**: No logs, no sync activity

**Solutions**:
- Verify cron triggers are deployed: `wrangler deployments list`
- Check worker logs: `wrangler tail`
- Ensure worker is deployed: `pnpm run deploy`

#### 2. Sync Errors

**Symptoms**: Logs show errors, sync status = 'error'

**Solutions**:
- Check external calendar URLs are valid
- Verify network connectivity to Airbnb/Expedia
- Review error messages in `ical_sync_log` table
- Test manual sync via API endpoint

#### 3. Performance Issues

**Symptoms**: Sync takes too long, timeouts

**Solutions**:
- Reduce number of active rooms
- Increase worker timeout (if possible)
- Optimize database queries
- Consider splitting into multiple cron jobs

#### 4. Database Lock Errors

**Symptoms**: D1 database write conflicts

**Solutions**:
- Use `onConflictDoUpdate` for upserts (already implemented)
- Add retry logic with exponential backoff
- Ensure proper indexing on `room_availability` table

## Future Enhancements

### Potential Improvements

1. **Webhooks**: Real-time sync instead of hourly polling
2. **Smart Sync**: Only sync rooms with recent changes
3. **Monitoring Dashboard**: Admin UI to view sync status
4. **Alerting**: Email/Slack notifications for sync failures
5. **Metrics**: Track sync performance over time
6. **Conflict Resolution**: Handle overlapping bookings better
7. **Two-way Sync**: Export local bookings to external calendars

## Security

### Best Practices

1. **Secrets Management**: Never commit API keys or secrets
2. **URL Validation**: Validate external calendar URLs before fetching
3. **Rate Limiting**: Respect external API rate limits
4. **Error Handling**: Don't expose sensitive data in logs
5. **Access Control**: Restrict who can trigger manual syncs

## Related Documentation

- [ICAL_SYNC_README.md](./ICAL_SYNC_README.md) - iCal service implementation details
- [STRIPE_WEBHOOK_SETUP.md](./STRIPE_WEBHOOK_SETUP.md) - Payment webhook setup
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Support

For issues or questions:

1. Check the logs: `wrangler tail`
2. Review sync history in database
3. Test manually to isolate the issue
4. Check Cloudflare Workers status page

---

**Last Updated**: October 2, 2025
