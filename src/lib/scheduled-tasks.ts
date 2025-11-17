import { and, eq, lte } from 'drizzle-orm';
import { createDrizzle } from '@/db/drizzle-init';
import { bookings, icalSyncLog, room } from '@/db/schema-export';
import { iCalService } from '@/lib/ical-service';

interface ScheduledEnv {
	DB: D1Database;
	KV_ICAL_SYNC_LOG: KVNamespace;
}

/**
 * Scheduled calendar sync function
 * Automatically syncs external calendars from Airbnb and expedia
 */
export async function scheduledCalendarSync(env: ScheduledEnv) {
	const db = createDrizzle(env.DB);
	const icalService = new iCalService(env.DB);

	console.log(
		'🚀 Starting scheduled calendar sync...',
		new Date().toISOString(),
	);

	try {
		// Get all active rooms with external calendar URLs
		const rooms = await db.select().from(room).where(eq(room.isActive, true));

		console.log(`📋 Found ${rooms.length} active rooms to sync`);

		let totalSynced = 0;
		let totalErrors = 0;
		const syncResults: Array<{
			roomId: string;
			roomSlug: string;
			platform: 'airbnb' | 'expedia';
			success: boolean;
			bookingsProcessed?: number;
			errorMessage?: string;
		}> = [];

		// Process each room
		for (const roomData of rooms) {
			console.log(`🏠 Processing room: ${roomData.slug} (${roomData.id})`);

			// Sync Airbnb calendar if URL exists
			if (roomData.airbnbIcalUrl) {
				console.log(`  📥 Syncing Airbnb calendar...`);
				try {
					const result = await icalService.syncExternalCalendar(
						roomData.id,
						'airbnb',
					);

					syncResults.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'airbnb',
						success: result.success,
						bookingsProcessed: result.bookingsProcessed,
						errorMessage: result.errorMessage,
					});

					if (result.success) {
						totalSynced++;
						console.log(
							`  ✅ Airbnb sync successful: ${result.bookingsProcessed} bookings processed`,
						);
					} else {
						totalErrors++;
						// Truncate long error messages for logging
						const truncatedError = result.errorMessage
							? result.errorMessage.length > 200
								? `${result.errorMessage.substring(0, 200)}... (truncated)`
								: result.errorMessage
							: 'Unknown error';
						console.error(`  ❌ Airbnb sync failed: ${truncatedError}`);
					}
				} catch (error) {
					totalErrors++;
					const errorMsg =
						error instanceof Error ? error.message : 'Unknown error';
					// Truncate long error messages for logging
					const truncatedError =
						errorMsg.length > 200
							? `${errorMsg.substring(0, 200)}... (truncated)`
							: errorMsg;
					console.error(`  ❌ Airbnb sync error: ${truncatedError}`);

					syncResults.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'airbnb',
						success: false,
						errorMessage: errorMsg,
					});
				}

				// Small delay to avoid overwhelming external APIs
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// Sync expedia calendar if URL exists
			if (roomData.expediaIcalUrl) {
				console.log(`  📥 Syncing Expedia calendar...`);
				try {
					const result = await icalService.syncExternalCalendar(
						roomData.id,
						'expedia',
					);

					syncResults.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'expedia',
						success: result.success,
						bookingsProcessed: result.bookingsProcessed,
						errorMessage: result.errorMessage,
					});

					if (result.success) {
						totalSynced++;
						console.log(
							`  ✅ Expedia.com sync successful: ${result.bookingsProcessed} bookings processed`,
						);
					} else {
						totalErrors++;
						// Truncate long error messages for logging
						const truncatedError = result.errorMessage
							? result.errorMessage.length > 200
								? `${result.errorMessage.substring(0, 200)}... (truncated)`
								: result.errorMessage
							: 'Unknown error';
						console.error(`  ❌ Expedia.com sync failed: ${truncatedError}`);
					}
				} catch (error) {
					totalErrors++;
					const errorMsg =
						error instanceof Error ? error.message : 'Unknown error';
					// Truncate long error messages for logging
					const truncatedError =
						errorMsg.length > 200
							? `${errorMsg.substring(0, 200)}... (truncated)`
							: errorMsg;
					console.error(`  ❌ Expedia.com sync error: ${truncatedError}`);

					syncResults.push({
						roomId: roomData.id,
						roomSlug: roomData.slug,
						platform: 'expedia',
						success: false,
						errorMessage: errorMsg,
					});
				}

				// Small delay to avoid overwhelming external APIs
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		const summary = {
			totalRooms: rooms.length,
			totalSyncAttempts: syncResults.length,
			totalSynced,
			totalErrors,
			timestamp: new Date().toISOString(),
			// Only store summary of results, not full details (reduces size)
			successfulSyncs: syncResults
				.filter((r) => r.success)
				.map((r) => ({ roomId: r.roomId, platform: r.platform })),
			failedSyncs: syncResults
				.filter((r) => !r.success)
				.map((r) => ({
					roomId: r.roomId,
					platform: r.platform,
					error:
						r.errorMessage && r.errorMessage.length > 100
							? `${r.errorMessage.substring(0, 100)}...`
							: r.errorMessage,
				})),
		};

		console.log(`🎉 Calendar sync completed:`);
		console.log(`  📊 Total rooms: ${summary.totalRooms}`);
		console.log(`  🔄 Sync attempts: ${summary.totalSyncAttempts}`);
		console.log(`  ✅ Successful: ${summary.totalSynced}`);
		console.log(`  ❌ Errors: ${summary.totalErrors}`);

		// Store summary in KV for monitoring dashboard (optional)
		// Add a small delay to avoid hitting rate limits after heavy DB operations
		try {
			await new Promise((resolve) => setTimeout(resolve, 100));
			const key = `sync_summary:${Date.now()}`;
			await env.KV_ICAL_SYNC_LOG.put(key, JSON.stringify(summary), {
				expirationTtl: 86400 * 7, // Keep for 7 days
			});
			console.log(`📝 Sync summary stored in KV: ${key}`);
		} catch (kvError) {
			// KV storage is optional, don't let it break the sync
			console.warn(
				'⚠️ Failed to store sync summary in KV (non-critical):',
				kvError instanceof Error ? kvError.message : 'Unknown error',
			);
		}

		return summary;
	} catch (error) {
		console.error('💥 Scheduled sync failed:', error);
		throw error;
	}
}

/**
 * Cleanup old sync logs (runs weekly)
 * Removes sync logs older than 30 days to prevent database bloat
 */
export async function scheduledIcalLogCleanup(env: ScheduledEnv) {
	console.log('🧹 Starting scheduled cleanup...', new Date().toISOString());

	try {
		const db = createDrizzle(env.DB);

		// Calculate 30 days ago in milliseconds
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		console.log(
			`🗑️ Cleaning up sync logs older than: ${thirtyDaysAgo.toISOString()}`,
		);

		// First, count how many logs will be deleted (for logging)
		const oldLogs = await db
			.select({ id: icalSyncLog.id })
			.from(icalSyncLog)
			.where(lte(icalSyncLog.createdAt, thirtyDaysAgo));

		const deletedCount = oldLogs.length;

		// Delete sync logs older than 30 days
		if (deletedCount > 0) {
			await db
				.delete(icalSyncLog)
				.where(lte(icalSyncLog.createdAt, thirtyDaysAgo));
		}

		console.log(
			`✅ Cleanup completed: ${deletedCount} old sync logs removed`,
		);

		return {
			cleaned: deletedCount,
			cutoffDate: thirtyDaysAgo.toISOString(),
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		console.error('💥 Scheduled cleanup failed:', error);
		throw error;
	}
}

/**
 * Cleanup expired pending bookings (runs hourly)
 * Removes pending bookings that have passed their expiration time (30 minutes)
 */
export async function scheduledBookingCleanup(env: ScheduledEnv) {
	console.log(
		'🧹 Starting expired pending bookings cleanup...',
		new Date().toISOString(),
	);

	try {
		const db = createDrizzle(env.DB);
		const now = new Date();

		// First, count how many bookings will be deleted (for logging)
		const expiredBookings = await db
			.select({ id: bookings.id })
			.from(bookings)
			.where(and(eq(bookings.status, 'pending'), lte(bookings.expiresAt, now)));

		const deletedCount = expiredBookings.length;

		// Delete pending bookings where expiresAt is in the past
		// Note: Removed .returning() to reduce D1 transaction overhead
		if (deletedCount > 0) {
			await db
				.delete(bookings)
				.where(
					and(eq(bookings.status, 'pending'), lte(bookings.expiresAt, now)),
				);
		}

		console.log(
			`✅ Booking cleanup completed: ${deletedCount} expired pending bookings removed`,
		);

		return {
			deletedCount,
			timestamp: now.toISOString(),
		};
	} catch (error) {
		console.error('💥 Scheduled booking cleanup failed:', error);
		throw error;
	}
}

/**
 * Main scheduled event handler for Cloudflare Workers
 * This function will be called by the cron triggers
 */
export async function handleScheduledEvent(
	event: ScheduledEvent,
	env: ScheduledEnv,
	_ctx: ExecutionContext,
): Promise<void> {
	const cron = event.cron;

	console.log(`⏰ Scheduled event triggered: ${cron}`);

	try {
		// Handle different cron schedules
		switch (cron) {
			case '*/30 * * * *': // Every 30 minutes run calendar sync
				await scheduledCalendarSync(env);
				break;

			case '5 2 * * *': // Every 24 hours at 2:05 AM - cleanup expired pending bookings
				await scheduledBookingCleanup(env);
				break;

			case '55 * * * *': // Weekly on Sunday at 2 AM - cleanup iCal sync logs
				await scheduledIcalLogCleanup(env);
				break;

			default:
				console.warn(`⚠️ Unknown cron schedule: ${cron}`);
				// Default to calendar sync for any unrecognized schedule
				await scheduledCalendarSync(env);
		}
	} catch (error) {
		console.error('💥 Scheduled event failed:', error);
		// Don't re-throw to prevent infinite retries
	}
}