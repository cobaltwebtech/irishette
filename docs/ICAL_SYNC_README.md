# iCal sync (import and export)

The site shares availability with Airbnb, Expedia, Vrbo, Booking.com and other
platforms through iCal feeds, in both directions.

| Direction | What | Code |
|---|---|---|
| Import | Other platforms' reservations block dates here | `src/lib/ical-sync.ts`, `src/lib/ical-parse.ts` |
| Export | Our bookings and blocks block dates on the platforms | `src/lib/ical-export.ts`, `src/lib/ical-generate.ts` |

Admin UI: **Admin → Property → (room) → Calendar Integrations**
(`src/components/admin/RoomCalendarIntegration.tsx`). Admin API: the `ical`
tRPC router (`src/integrations/trpc/ical.ts`). All of it is admin-only.

## Import

### Feeds are data

Each room has any number of rows in `ical_feeds` (source, label, URL, active).
Adding a platform is adding a feed in the admin UI, not a code change. Feed URLs
contain the platform's secret and are only returned by admin procedures.

### When feeds sync

- Every 30 minutes (cron `*/30 * * * *`, all active feeds in parallel).
- Before every PaymentIntent (`bookings.createPaymentIntent`): the room's
  feeds, skipping any attempted in the last 2 minutes, 5-second timeout. Then
  availability is checked again.
- "Sync now" in the admin UI (`ical.syncRoom`, all of a room's feeds).

Evaluate a 5-minute cron at production go-live.

### One sync run (`syncFeed`)

1. **Fetch** with a 10 s timeout and `If-None-Match` / `If-Modified-Since`
   through `fetchFeed` (`src/lib/ical-fetch.ts`): public `https:` URLs only
   (no IP literals, `localhost` or credentials), checked again on each of up
   to 5 redirects, and bodies over 5 MB are refused. Feed URLs are validated
   with the same rule when saved, and the admin "Test URL" action
   (`ical.testUrl`) uses the same fetch. A `304` only updates the feed's
   timestamps.
2. **Validate.** The run is rejected, and stored events are left untouched,
   when the response is not HTTP 200, is not a `VCALENDAR`, has no events
   while the last run had some, or drops by more than half (from 4 or more).
   The error is stored on the feed and the admins get one email when a healthy
   feed starts failing (not on every retry). If a drop is real, use
   **Apply anyway** (`force: true`).
3. **Parse** (RFC 5545): line unfolding, CRLF/LF, `VALUE=DATE`, `TZID` and
   UTC date-times (converted to property dates in `America/Chicago`),
   `DURATION`, no `DTEND` (one day). Skipped: `STATUS:CANCELLED`, events
   without a `UID`, and our own exported events (`booking-…@irishette`,
   `block-…@irishette`). Host blocks ("Not available", "Blocked", ...) are kept
   as `unavailable`.
4. **Diff** by `(feed, UID)` against `external_events`, ignoring events that
   already ended, and apply inserts, updates, deletes, the run log and the
   change log in **one D1 batch** (a transaction).
5. **Conflicts:** new or changed events that overlap a confirmed booking or a
   live hold are logged and emailed to the admins.

Imported events have an **exclusive** end date (iCal `DTEND`).

### Sync history

- `ical_sync_log`: one row per run (trigger, status, HTTP status, events in
  feed, added/updated/removed/conflicts, error, duration).
- `ical_sync_changes`: what each run changed (event dates before/after) and,
  for conflicts, the booking.
- Both are kept 30 days (cron `15 9 * * *`). Admin: "Recent syncs" in the room
  page, `ical.getSyncLogs` (newest first) and `ical.getSyncChanges`.

## Export

URL: `/api/ical/<room publicId>/<token>.ics`. The token is a per-room secret
(`room.ical_export_token`). A wrong token or an unknown room is a plain `404`;
tokens are compared in constant time.

Contents: only **confirmed bookings on this site** and **admin blocks**, from
30 days ago to 2 years ahead, each as an all-day `SUMMARY:Reserved` event (no
names, notes or confirmation ids). Imported events are never exported. Booking
`DTEND` is the check-out date; block `DTEND` is the day after the block's last
day. Headers: `text/calendar; charset=utf-8`, `Cache-Control: private,
max-age=300`.

Admin: copy the URL from the room page. **Regenerate URL** creates a new token;
the old URL stops working, so update it on every platform.

Before connecting a platform: validate the feed with an iCal validator and
test-import it into Google Calendar. After connecting, check that a direct
booking appears after the platform's next pull (Airbnb pulls about every 3
hours).

## Date rules

Shared by the server and the booking calendar (`src/lib/date-range.ts`):

| Rule | Condition |
|---|---|
| Stay vs booking or live hold | `in < b.out && out > b.in` (same-day turnover allowed) |
| Stay vs imported event | `in < e.end && out > e.start` (end exclusive) |
| Stay vs admin block | `in <= blk.end && out > blk.start` (block inclusive) |

## Tests

`test/unit/ical-parse.test.ts`, `test/unit/ical-generate.test.ts`,
`test/workers/ical-sync.test.ts`, `test/workers/ical-route.test.ts`.
