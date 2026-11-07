import { and, eq, inArray, lte } from 'drizzle-orm';
import { bookings, icalSyncChanges, icalSyncLog } from '@/db/schema-export';
import { confirmBookingPayment } from './booking-service';
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
 * Deletes pending holds that expired. A hold whose PaymentIntent succeeded
 * (the guest paid but confirmation never ran) is confirmed instead, or kept
 * if that fails; a hold whose intent is still open has the intent cancelled.
 */
export async function scheduledBookingCleanup(
	deps: ServiceDeps,
	now = new Date(),
) {
	const { db, stripe } = deps;
	const expired = await db
		.select()
		.from(bookings)
		.where(and(eq(bookings.status, 'pending'), lte(bookings.expiresAt, now)));

	const deletable: string[] = [];
	let kept = 0;
	for (const booking of expired) {
		if (!booking.stripePaymentIntentId) {
			deletable.push(booking.id);
			continue;
		}
		try {
			const intent = await stripe.paymentIntents.retrieve(
				booking.stripePaymentIntentId,
			);
			if (intent.status === 'succeeded') {
				kept++;
				await confirmBookingPayment(deps, booking.id, intent.id, now).catch(
					(error: unknown) =>
						console.error(
							`Paid hold ${booking.confirmationId} could not be confirmed:`,
							error instanceof Error ? error.message : 'Unknown error',
						),
				);
				continue;
			}
			if (intent.status === 'processing') {
				kept++;
				continue;
			}
			if (intent.status !== 'canceled') {
				await stripe.paymentIntents.cancel(intent.id);
			}
			deletable.push(booking.id);
		} catch (error) {
			// Unknown payment state: keep the hold and try again tomorrow.
			kept++;
			console.error(
				`Expired hold ${booking.confirmationId} kept (Stripe check failed):`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}

	if (deletable.length > 0) {
		await db
			.delete(bookings)
			.where(
				and(inArray(bookings.id, deletable), eq(bookings.status, 'pending')),
			);
	}
	console.log(
		`Expired holds: ${deletable.length} deleted, ${kept} kept (payment found or unknown)`,
	);
	return { deletedCount: deletable.length, kept };
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
