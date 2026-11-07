import { and, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '@/db/drizzle-init';
import { externalEvents, icalFeeds } from '@/db/schema-export';

// Transitional helpers that map the legacy "one Airbnb URL + one Expedia URL
// per room" API onto the ical_feeds table. Upgrade Phase 7b replaces these with
// a feed list (any number of feeds per room, any source).

export type LegacyFeedPlatform = 'airbnb' | 'expedia';

/** Active feed for a room and platform, if any. */
export async function getActiveFeed(
	db: Database,
	roomId: string,
	source: LegacyFeedPlatform,
) {
	const rows = await db
		.select()
		.from(icalFeeds)
		.where(
			and(
				eq(icalFeeds.roomId, roomId),
				eq(icalFeeds.source, source),
				eq(icalFeeds.isActive, true),
			),
		)
		.limit(1);
	return rows[0];
}

/** Admin-only view of a room's legacy feed URLs and last sync times. */
export async function getLegacyFeedConfig(db: Database, roomId: string) {
	const feeds = await db
		.select()
		.from(icalFeeds)
		.where(and(eq(icalFeeds.roomId, roomId), eq(icalFeeds.isActive, true)));
	const airbnb = feeds.find((f) => f.source === 'airbnb');
	const expedia = feeds.find((f) => f.source === 'expedia');
	return {
		airbnbIcalUrl: airbnb?.url ?? null,
		expediaIcalUrl: expedia?.url ?? null,
		lastAirbnbSync: airbnb?.lastSuccessAt ?? null,
		lastExpediaSync: expedia?.lastSuccessAt ?? null,
	};
}

/**
 * Set (or clear, with null/empty) the single legacy feed URL for a platform.
 * Replaces any existing feed rows for that room + platform.
 */
export async function setLegacyFeedUrl(
	db: Database,
	roomId: string,
	source: LegacyFeedPlatform,
	url: string | null | undefined,
) {
	const trimmed = url?.trim() || null;
	const existing = await db
		.select({ id: icalFeeds.id, url: icalFeeds.url })
		.from(icalFeeds)
		.where(and(eq(icalFeeds.roomId, roomId), eq(icalFeeds.source, source)));

	// Unchanged URL: keep the feed (and its imported events, which cascade on delete).
	if (existing.length === 1 && existing[0].url === trimmed) return;

	await db
		.delete(icalFeeds)
		.where(and(eq(icalFeeds.roomId, roomId), eq(icalFeeds.source, source)));
	if (trimmed) {
		await db.insert(icalFeeds).values({ roomId, source, url: trimmed });
	}
}

/**
 * Imported external events overlapping [startDate, endDate], in the row shape
 * the old room_availability readers expect.
 * TODO(upgrade Phase 7.2): replace readers with the shared checkAvailability().
 */
export async function getExternalEventsInRange(
	db: Database,
	roomId: string,
	startDate: string,
	endDate: string,
) {
	const rows = await db
		.select({
			id: externalEvents.id,
			roomId: externalEvents.roomId,
			checkInDate: externalEvents.startDate,
			checkOutDate: externalEvents.endDate,
			source: icalFeeds.source,
			externalBookingId: externalEvents.uid,
		})
		.from(externalEvents)
		.innerJoin(icalFeeds, eq(externalEvents.feedId, icalFeeds.id))
		.where(
			and(
				eq(externalEvents.roomId, roomId),
				lte(externalEvents.startDate, endDate),
				gte(externalEvents.endDate, startDate),
			),
		);
	return rows.map((row) => ({
		...row,
		source: row.source as string,
		isAvailable: false,
		isBlocked: true,
		priceOverride: null as number | null,
	}));
}
