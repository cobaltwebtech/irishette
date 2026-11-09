import { sql } from 'drizzle-orm';

import { adminInboxItems } from '@/db/schema-export';

import type { ServiceDeps } from './deps';
import {
	INBOX_KIND_SOURCE,
	type InboxDetailsByKind,
	type InboxKind,
} from './inbox';

// Writes to the admin notification inbox (docs/ADMIN_INBOX.md). Server-only.
// Used by the Stripe webhook, the booking service and the cron handlers, next
// to the admin alert emails (the emails stay).

export interface NewInboxItem<K extends InboxKind = InboxKind> {
	kind: K;
	/** Short line for the list. No guest message bodies, no card data. */
	title: string;
	summary: string;
	details: InboxDetailsByKind[K];
	bookingId?: string | null;
	userId?: string | null;
	/** payment_dispute items: the stored dispute (payment_disputes.id). */
	paymentDisputeId?: string | null;
	/**
	 * Same key = same item: a repeat updates it instead of adding a row
	 * (webhook replays, cron retries). Omit for one item per call.
	 */
	dedupeKey?: string;
}

export interface CreateInboxItemOptions {
	/**
	 * On a repeat, put the item back in front of admins (status 'new', top of
	 * the list) only if it last surfaced at least this long ago. 0 (default):
	 * every repeat resurfaces. Use it for problems a cron finds again on every
	 * run (e.g. a double booking seen every 30 minutes).
	 */
	resurfaceAfterSeconds?: number;
	now?: Date;
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * Adds a notification, or updates the one with the same `dedupeKey` (new
 * title, summary and details; one more occurrence; resurfaced as new, see
 * `resurfaceAfterSeconds`). Never throws: a failure is logged with the kind
 * and dedupe key only, so callers can run it next to their main work.
 * Returns the item's publicId, or null on failure.
 */
export async function createInboxItem<K extends InboxKind>(
	deps: Pick<ServiceDeps, 'db'>,
	item: NewInboxItem<K>,
	{ resurfaceAfterSeconds = 0, now = new Date() }: CreateInboxItemOptions = {},
): Promise<string | null> {
	const t = adminInboxItems;
	const resurface =
		resurfaceAfterSeconds > 0
			? sql`${t.surfacedAt} <= ${seconds(now) - resurfaceAfterSeconds}`
			: sql`1`;
	try {
		const [row] = await deps.db
			.insert(t)
			.values({
				source: INBOX_KIND_SOURCE[item.kind],
				kind: item.kind,
				title: item.title,
				summary: item.summary,
				details: item.details,
				bookingId: item.bookingId ?? null,
				userId: item.userId ?? null,
				paymentDisputeId: item.paymentDisputeId ?? null,
				dedupeKey: item.dedupeKey ?? null,
				surfacedAt: now,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: t.dedupeKey,
				set: {
					title: item.title,
					summary: item.summary,
					details: item.details,
					...(item.bookingId ? { bookingId: item.bookingId } : {}),
					...(item.userId ? { userId: item.userId } : {}),
					...(item.paymentDisputeId
						? { paymentDisputeId: item.paymentDisputeId }
						: {}),
					occurrences: sql`${t.occurrences} + 1`,
					status: sql`CASE WHEN ${resurface} THEN 'new' ELSE ${t.status} END`,
					readAt: sql`CASE WHEN ${resurface} THEN NULL ELSE ${t.readAt} END`,
					archivedAt: sql`CASE WHEN ${resurface} THEN NULL ELSE ${t.archivedAt} END`,
					surfacedAt: sql`CASE WHEN ${resurface} THEN ${seconds(now)} ELSE ${t.surfacedAt} END`,
					updatedAt: now,
				},
			})
			.returning({ publicId: t.publicId });
		return row?.publicId ?? null;
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'inbox-item-failed',
				kind: item.kind,
				dedupeKey: item.dedupeKey ?? null,
				error: error instanceof Error ? error.message : 'Unknown error',
			}),
		);
		return null;
	}
}

/** createInboxItem after the response (waitUntil); for request handlers. */
export function createInboxItemInBackground<K extends InboxKind>(
	deps: Pick<ServiceDeps, 'db' | 'waitUntil'>,
	item: NewInboxItem<K>,
	options?: CreateInboxItemOptions,
) {
	deps.waitUntil(createInboxItem(deps, item, options));
}
