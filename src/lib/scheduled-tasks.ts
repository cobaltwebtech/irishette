import { and, eq, lte, ne } from 'drizzle-orm';

import { bookings, icalSyncChanges, icalSyncLog } from '@/db/schema-export';

import { releaseExpiredHold } from './booking-service';
import { createServiceDeps, type ServiceDeps } from './deps';
import { syncAllFeeds } from './ical-sync';

// Cron handlers. Keep CRON_SCHEDULES in sync with the triggers in
// cloudflare.config.ts (test/workers/scheduled.test.ts checks this).

/** Sync history kept for this many days. */
export const SYNC_LOG_RETENTION_DAYS = 30;

/** Import all active iCal feeds (every 30 minutes). */
export async function scheduledCalendarSync(deps: ServiceDeps) {
	const results = await syncAllFeeds(deps, { trigger: 'cron' });
	const failed = results.filter(
		(r) => r.status === 'error' || r.status === 'rejected',
	);
	console.log(
		`iCal sync: ${results.length} feed(s), ${failed.length} failed, ` +
			`${results.reduce((n, r) => n + r.added + r.updated + r.removed, 0)} change(s), ` +
			`${results.reduce((n, r) => n + r.conflicts, 0)} conflict(s)`,
	);
	return results;
}

/**
 * Releases pending holds that expired: their Checkout Session is expired
 * first so it can't be paid. A hold whose session was paid (confirmation
 * never ran) is confirmed instead; holds with a delayed payment processing
 * are kept until the webhook settles them.
 */
export async function scheduledBookingCleanup(
	deps: ServiceDeps,
	now = new Date(),
) {
	const expired = await deps.db
		.select({
			id: bookings.id,
			confirmationId: bookings.confirmationId,
			stripeSessionId: bookings.stripeSessionId,
			paymentStatus: bookings.paymentStatus,
		})
		.from(bookings)
		.where(
			and(
				eq(bookings.status, 'pending'),
				lte(bookings.expiresAt, now),
				ne(bookings.paymentStatus, 'processing'),
			),
		);

	let deletedCount = 0;
	let kept = 0;
	for (const hold of expired) {
		try {
			if (await releaseExpiredHold(deps, hold, now)) deletedCount++;
			else kept++;
		} catch (error) {
			// Unknown payment state: keep the hold and try again tomorrow.
			kept++;
			console.error(
				`Expired hold ${hold.confirmationId} kept (Stripe check failed):`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}
	console.log(
		`Expired holds: ${deletedCount} deleted, ${kept} kept (payment found or unknown)`,
	);
	return { deletedCount, kept };
}

/** Deletes iCal sync history older than SYNC_LOG_RETENTION_DAYS. */
export async function scheduledIcalLogCleanup(
	deps: ServiceDeps,
	now = new Date(),
) {
	const { db } = deps;
	const cutoff = new Date(now.getTime() - SYNC_LOG_RETENTION_DAYS * 86_400_000);
	const [changes, logs] = await db.batch([
		db
			.delete(icalSyncChanges)
			.where(lte(icalSyncChanges.createdAt, cutoff))
			.returning({ id: icalSyncChanges.id }),
		db
			.delete(icalSyncLog)
			.where(lte(icalSyncLog.createdAt, cutoff))
			.returning({ id: icalSyncLog.id }),
	]);
	console.log(
		`Sync history cleanup: ${logs.length} run(s), ${changes.length} change(s) older than ${cutoff.toISOString()} removed`,
	);
	return { logs: logs.length, changes: changes.length, cutoff };
}

type Task = (deps: ServiceDeps) => Promise<unknown>;

/** Cron expression → task. Unknown expressions do nothing. */
export const CRON_SCHEDULES: Readonly<Record<string, Task>> = {
	'*/30 * * * *': scheduledCalendarSync,
	'5 8 * * *': (deps) => scheduledBookingCleanup(deps), // 08:05 UTC
	'15 9 * * *': (deps) => scheduledIcalLogCleanup(deps), // 09:15 UTC
};

/** Worker `scheduled` handler (src/server.ts). */
export async function handleScheduledEvent(
	controller: ScheduledController,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	const task = CRON_SCHEDULES[controller.cron];
	if (!task) {
		console.warn(`Unknown cron schedule "${controller.cron}": nothing to do`);
		return;
	}
	const deps = createServiceDeps(env, (p) => ctx.waitUntil(p));
	try {
		await task(deps);
	} catch (error) {
		console.error(
			`Cron "${controller.cron}" failed:`,
			error instanceof Error ? (error.stack ?? error.message) : error,
		);
		// Rethrow so the failure shows in Workers observability.
		throw error;
	}
}
