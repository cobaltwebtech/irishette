import { eq, lt, sql } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import { sentEmails } from '@/db/schema-export';

// Duplicate protection for outgoing email. Cloudflare Email Service has no
// idempotency key, so a message is "claimed" in D1 (unique key) before it is
// sent and the claim is released when the send fails. Admin alerts are also
// throttled: one email per alert per hour, repeats are counted and reported in
// the next email for the same alert.

/** Alert throttle window. */
export const ALERT_WINDOW_SECONDS = 3600;

/** Sent-email rows are kept this many days (the daily cron purges older). */
export const SENT_EMAIL_RETENTION_DAYS = 7;

/** True when this call claimed the key; false when it was already claimed. */
export async function claimEmail(
	db: Database,
	key: string,
	kind: 'message' | 'alert',
): Promise<boolean> {
	const rows = await db
		.insert(sentEmails)
		.values({ key, kind })
		.onConflictDoNothing({ target: sentEmails.key })
		.returning({ id: sentEmails.id });
	return rows.length > 0;
}

/** Frees a claim so a retry can send (called when the send failed). */
export async function releaseEmail(db: Database, key: string): Promise<void> {
	await db.delete(sentEmails).where(eq(sentEmails.key, key));
}

/** Start of the alert window containing `now`, in UTC Unix seconds. */
export function alertWindowStart(now: Date): number {
	const seconds = Math.floor(now.getTime() / 1000);
	return Math.floor(seconds / ALERT_WINDOW_SECONDS) * ALERT_WINDOW_SECONDS;
}

function alertKey(base: string, windowStart: number): string {
	return `alert:${base}@${windowStart}`;
}

export type AlertClaim =
	| { send: false }
	| {
			send: true;
			/** Claim key; pass it to releaseEmail if the send fails. */
			key: string;
			/** Repeats suppressed in the previous window (0 when none). */
			suppressedBefore: number;
	  };

/**
 * Claims this hour's slot for an alert. A repeat in the same hour is counted
 * and skipped. A claim that succeeds also reports how many repeats were
 * suppressed in the previous hour, so the email can say so.
 */
export async function claimAlert(
	db: Database,
	base: string,
	now: Date,
): Promise<AlertClaim> {
	const windowStart = alertWindowStart(now);
	const key = alertKey(base, windowStart);
	if (!(await claimEmail(db, key, 'alert'))) {
		await db
			.update(sentEmails)
			.set({ suppressedCount: sql`${sentEmails.suppressedCount} + 1` })
			.where(eq(sentEmails.key, key));
		return { send: false };
	}
	const [previous] = await db
		.select({ count: sentEmails.suppressedCount })
		.from(sentEmails)
		.where(
			eq(sentEmails.key, alertKey(base, windowStart - ALERT_WINDOW_SECONDS)),
		)
		.limit(1);
	return { send: true, key, suppressedBefore: previous?.count ?? 0 };
}

/** Deletes sent-email rows older than SENT_EMAIL_RETENTION_DAYS. */
export async function purgeSentEmails(
	db: Database,
	now: Date,
): Promise<number> {
	const cutoff = new Date(
		now.getTime() - SENT_EMAIL_RETENTION_DAYS * 86_400_000,
	);
	const rows = await db
		.delete(sentEmails)
		.where(lt(sentEmails.sentAt, cutoff))
		.returning({ id: sentEmails.id });
	return rows.length;
}
