import { and, eq, gte, isNotNull, lte, ne, or } from 'drizzle-orm';

import { bookings, icalSyncChanges, icalSyncLog } from '@/db/schema-export';
import {
	releaseExpiredHold,
	retryCancellationRefund,
} from '@/lib/booking/booking-service';
import {
	confirmBookingPayment,
	settlePaidHold,
} from '@/lib/booking/checkout-service';
import { purgeSentEmails } from '@/lib/email/email-dedupe';
import { syncAllFeeds } from '@/lib/ical/ical-sync';

import { createServiceDeps, type ServiceDeps } from './deps';

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

/** A payment step left unfinished this long is retried by the recovery. */
export const PAYMENT_RECOVERY_AFTER_MINUTES = 15;

/**
 * Finishes payment work a stopped Worker left half done (plan 05), every
 * 30 minutes:
 * - confirmed bookings still 'authorized': capture (or release) the card
 *   authorization, well before it lapses (5 to 7 days);
 * - cancelled bookings still 'refund_pending': create (or find and record)
 *   the cancellation refund;
 * - pending holds whose session the guest completed but nothing confirmed
 *   (webhook failing, tab closed before the return page): confirm and
 *   capture, before anyone else can take the dates. Holds expired for more
 *   than a day are left to the daily cleanup.
 * Each booking is isolated: a failure is logged and retried next run.
 */
export async function scheduledPaymentRecovery(
	deps: ServiceDeps,
	now = new Date(),
) {
	const cutoff = new Date(
		now.getTime() - PAYMENT_RECOVERY_AFTER_MINUTES * 60_000,
	);
	const stuck = await deps.db
		.select({
			id: bookings.id,
			confirmationId: bookings.confirmationId,
			status: bookings.status,
			stripeSessionId: bookings.stripeSessionId,
		})
		.from(bookings)
		.where(
			and(
				lte(bookings.updatedAt, cutoff),
				or(
					and(
						eq(bookings.status, 'confirmed'),
						eq(bookings.paymentStatus, 'authorized'),
						isNotNull(bookings.stripeSessionId),
					),
					and(
						eq(bookings.status, 'cancelled'),
						eq(bookings.paymentStatus, 'refund_pending'),
					),
					and(
						eq(bookings.status, 'pending'),
						ne(bookings.paymentStatus, 'processing'),
						isNotNull(bookings.stripeSessionId),
						gte(bookings.expiresAt, new Date(now.getTime() - 86_400_000)),
					),
				),
			),
		);

	let settled = 0;
	let failed = 0;
	for (const booking of stuck) {
		try {
			if (await recoverBooking(deps, booking, now)) settled++;
		} catch (error) {
			failed++;
			console.error(
				`Payment recovery for ${booking.confirmationId} failed (retried next run):`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}
	if (settled + failed > 0) {
		console.log(
			`Payment recovery: ${settled} settled, ${failed} failed of ${stuck.length} checked`,
		);
	}
	return { settled, failed };
}

/** One booking of scheduledPaymentRecovery. True if it was settled. */
async function recoverBooking(
	deps: ServiceDeps,
	booking: Pick<
		typeof bookings.$inferSelect,
		'id' | 'status' | 'stripeSessionId'
	>,
	now: Date,
) {
	if (booking.status === 'pending') {
		return settlePaidHold(deps, booking, now);
	}
	if (booking.status === 'confirmed' && booking.stripeSessionId) {
		await confirmBookingPayment(deps, booking.id, booking.stripeSessionId, now);
		return true;
	}
	await retryCancellationRefund(deps, booking.id, now);
	return true;
}

/**
 * Releases pending holds that expired: their Checkout Session is expired
 * first so it can't be paid. A hold whose session was completed in the
 * meantime is settled instead (captured or its authorization released).
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

/** Deletes email dedupe rows older than SENT_EMAIL_RETENTION_DAYS. */
export async function scheduledSentEmailCleanup(
	deps: ServiceDeps,
	now = new Date(),
) {
	const removed = await purgeSentEmails(deps.db, now);
	console.log(`Sent-email cleanup: ${removed} row(s) removed`);
	return { removed };
}

type Task = (deps: ServiceDeps) => Promise<unknown>;

/**
 * Runs every task even if one fails, then throws the first error (so it
 * still shows in Workers observability).
 */
async function runAll(deps: ServiceDeps, tasks: Task[]) {
	const errors: unknown[] = [];
	for (const task of tasks) {
		try {
			await task(deps);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) throw errors[0];
}

/** Cron expression → task. Unknown expressions do nothing. */
export const CRON_SCHEDULES: Readonly<Record<string, Task>> = {
	// Keep ICAL_SYNC_INTERVAL_MINUTES (src/lib/ical/ical-feed-sources.ts) in step.
	'*/30 * * * *': (deps) =>
		runAll(deps, [(d) => scheduledPaymentRecovery(d), scheduledCalendarSync]),
	'5 8 * * *': (deps) => scheduledBookingCleanup(deps), // 08:05 UTC
	// 09:15 UTC
	'15 9 * * *': (deps) =>
		runAll(deps, [
			(d) => scheduledIcalLogCleanup(d),
			(d) => scheduledSentEmailCleanup(d),
		]),
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
