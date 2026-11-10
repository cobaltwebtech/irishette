// Platforms an imported iCal feed can come from. Shared by the Drizzle schema
// (src/db/room-schema.ts) and the Zod schemas used by admin forms
// (src/lib/booking/room-validation.ts), so client code never imports the schema file.
// Also holds the sync schedule shown on the admin feed cards.
export const icalFeedSources = [
	'airbnb',
	'expedia',
	'vrbo',
	'booking',
	'other',
] as const;

/**
 * Minutes between scheduled iCal imports. Must match the `*\/30 * * * *`
 * cron in cloudflare.config.ts and src/lib/server/scheduled-tasks.ts.
 */
export const ICAL_SYNC_INTERVAL_MINUTES = 30;

/**
 * When the cron next syncs active feeds: the first interval boundary
 * (:00 or :30, UTC) strictly after `after`. The run itself may start a few
 * seconds later.
 */
export function nextIcalSyncAt(after: Date): Date {
	const step = ICAL_SYNC_INTERVAL_MINUTES * 60_000;
	return new Date((Math.floor(after.getTime() / step) + 1) * step);
}
