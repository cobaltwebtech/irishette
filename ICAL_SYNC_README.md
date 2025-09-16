# iCal Calendar Sync System

This system provides bidirectional calendar synchronization between your booking platform and external platforms like Airbnb and Expedia to prevent double bookings.

## Components

### 1. iCal Service (`src/lib/ical-service.ts`)

- Parses external iCal feeds from platforms like Airbnb/Expedia
- Generates your own iCal feed for external platforms to consume
- Handles calendar synchronization and conflict detection

### 2. Availability API (`src/integrations/trpc/availability.ts`)

- TRPC endpoints for checking room availability
- Sync external calendars on-demand
- Get availability calendar data for admin dashboard

### 3. HTTP Endpoints (`src/integrations/hono/config.ts`)

- `GET /api/rooms/:roomId/calendar.ics` - Serves iCal calendar file
- `GET /api/rooms/slug/:roomSlug/calendar.ics` - Alternative endpoint using room slug
- `GET /api/rooms/:roomId/calendar-info` - JSON endpoint with calendar metadata
- `POST /api/admin/sync-calendars` - Manual sync trigger for admin
- `GET /api/admin/sync-status` - Get sync status and history

### 4. Scheduled Tasks (`src/lib/scheduled-tasks.ts`)

- Automatic calendar synchronization every hour
- Weekly cleanup of old sync logs
- Comprehensive logging and error handling

## Cron Schedules

The system uses Cloudflare Workers' scheduled events with these cron expressions:

- `0 * * * *` - Every hour: Sync external calendars
- `0 2 * * 0` - Weekly on Sunday at 2 AM: Cleanup old logs

### Cron Format Reference

```
* * * * *
| | | | |
| | | | └── Day of week (0-7, Sunday = 0 or 7)
| | | └──── Month (1-12)
| | └────── Day of month (1-31)
| └──────── Hour (0-23)
└────────── Minute (0-59)
```

## Usage

## Usage

### Admin Dashboard Management

iCal URLs are managed through the admin dashboard via TRPC endpoints:

#### **Room iCal Configuration Endpoints:**

1. **Get iCal Configuration**:

```typescript
const config = await trpc.rooms.getIcalConfig.query({
  roomId: 'room_123',
})
```

2. **Update iCal URLs**:

```typescript
await trpc.rooms.updateIcalUrls.mutate({
  roomId: 'room_123',
  airbnbIcalUrl: 'https://airbnb.com/calendar/ical/property123.ics',
  expediaIcalUrl: 'https://expedia.com/calendar/ical/property123.ics',
})
```

3. **Test iCal URL**:

```typescript
const test = await trpc.rooms.testIcalUrl.mutate({
  url: 'https://airbnb.com/calendar/ical/property123.ics',
})
```

#### **Admin Dashboard Features:**

- ✅ **URL Management**: Add/edit/remove iCal URLs per room
- ✅ **URL Testing**: Validate URLs before saving
- ✅ **Sync Status**: See last sync times and status
- ✅ **Export URLs**: Get calendar feed URLs for sharing
- ✅ **Configuration Overview**: See which platforms are configured

### Development Testing

For testing during development, you can temporarily set iCal URLs through the admin interface to point to test calendars (like Google Calendar public feeds).

## Calendar Structure Options

The system supports both **property-level** and **room-level** calendar configurations:

### **Option 1: Property-Level Calendars (Most Common)**

- **1 Airbnb calendar** for the entire property
- **1 Expedia calendar** for the entire property
- All rooms' bookings appear in the same calendar
- Room identification through event titles/descriptions
- Simpler setup and management

### **Option 2: Room-Level Calendars**

- **Each room has its own calendar URL** on each platform
- More granular control per room
- Requires separate calendar setup for each room
- More complex but offers better room-specific management

### Setting up External Calendar URLs

**Production URLs are managed through the admin dashboard:**

- No more manual database updates
- URL validation before saving
- Easy updates when platform URLs change

### Providing Your Calendar to External PlatformsGive these URLs to external platforms:

- **By Room ID**: `https://yourdomain.com/api/rooms/:roomId/calendar.ics`
- **By Room Slug**: `https://yourdomain.com/api/rooms/slug/:roomSlug/calendar.ics`

### Manual Sync

Use TRPC endpoints or HTTP API:

```typescript
// Sync specific room and platform
const result = await trpc.availability.syncCalendar.mutate({
  roomId: 'room_123',
  platform: 'airbnb',
})

// Sync all calendars
const result = await trpc.availability.syncAllCalendars.mutate()
```

Or use HTTP API:

```bash
curl -X POST https://yourdomain.com/api/admin/sync-calendars
```

### Checking Availability

```typescript
// Check specific room availability
const availability = await trpc.availability.checkRoom.query({
  roomId: 'room_123',
  startDate: '2025-08-15',
  endDate: '2025-08-20',
})

// Bulk check multiple rooms
const bulkAvailability = await trpc.availability.checkBulk.query({
  roomIds: ['room_123', 'room_456'], // optional
  startDate: '2025-08-15',
  endDate: '2025-08-20',
})
```

## Database Schema

The system uses these tables:

- `room` - Room information with iCal URLs and sync timestamps
- `room_availability` - Daily availability records with external booking info
- `ical_sync_log` - Sync operation logs for monitoring
- `bookings` - Your internal bookings

## Monitoring

- Check sync logs: `trpc.availability.getSyncLogs.query()`
- Get sync status: `GET /api/admin/sync-status`
- View recent sync summaries stored in Cloudflare KV

## Deployment

The scheduled tasks are automatically deployed with your Cloudflare Worker. The cron triggers are configured in `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 * * * *",    # Every hour - sync external calendars
  "0 2 * * 0"     # Weekly on Sunday at 2 AM - cleanup old logs
]
```

## Error Handling

- All sync operations include comprehensive error handling
- Failed syncs are logged to `ical_sync_log` table
- Sync continues for other rooms even if one fails
- Rate limiting with delays between API calls

## Security Considerations

- iCal endpoints are public (as required by external platforms)
- Admin endpoints can be protected with authentication
- External API calls include proper user agents
- Caching headers prevent excessive requests
