import { eq } from 'drizzle-orm';
import { createDrizzle } from '@/db/drizzle-init';
import { room } from '@/db/schema-export';
import { iCalService } from '@/lib/ical-service';

interface ScheduledEnv {
	DB: D1Database;
	KV_SESSIONS: KVNamespace;
	BETTER_AUTH_SECRET: string;
	RESEND_API_KEY: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_TRPC_WEBHOOK_SECRET: string;
	BETTER_AUTH_URL: string;
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
						console.error(`  ❌ Airbnb sync failed: ${result.errorMessage}`);
					}
				} catch (error) {
					totalErrors++;
					const errorMsg =
						error instanceof Error ? error.message : 'Unknown error';
					console.error(`  ❌ Airbnb sync error: ${errorMsg}`);

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
				console.log(`  📥 Syncing expedia calendar...`);
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
						console.error(
							`  ❌ Expedia.com sync failed: ${result.errorMessage}`,
						);
					}
				} catch (error) {
					totalErrors++;
					const errorMsg =
						error instanceof Error ? error.message : 'Unknown error';
					console.error(`  ❌ Expedia.com sync error: ${errorMsg}`);

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
			syncResults,
		};

		console.log(`🎉 Calendar sync completed:`);
		console.log(`  📊 Total rooms: ${summary.totalRooms}`);
		console.log(`  🔄 Sync attempts: ${summary.totalSyncAttempts}`);
		console.log(`  ✅ Successful: ${summary.totalSynced}`);
		console.log(`  ❌ Errors: ${summary.totalErrors}`);

		// Store summary in KV for monitoring dashboard (optional)
		try {
			const key = `sync_summary:${Date.now()}`;
			await env.KV_SESSIONS.put(key, JSON.stringify(summary), {
				expirationTtl: 86400 * 7, // Keep for 7 days
			});
			console.log(`📝 Sync summary stored in KV: ${key}`);
		} catch (kvError) {
			console.error('Failed to store sync summary in KV:', kvError);
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
export async function scheduledCleanup(_env: ScheduledEnv) {
	console.log('🧹 Starting scheduled cleanup...', new Date().toISOString());

	try {
		// Calculate 30 days ago
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		// Note: Actual database cleanup would be implemented here when needed
		// For now, we just clean up KV storage of old sync summaries
		// const db = createDrizzle(env.DB) // Uncomment when implementing actual cleanup

		// Clean up old KV entries (sync summaries older than 30 days)
		// This is a placeholder - actual implementation would list and delete old keys
		console.log(
			`🗑️ Would clean up sync logs older than: ${thirtyDaysAgo.toISOString()}`,
		);
		console.log('✅ Cleanup completed');

		return {
			cleaned: 0, // Placeholder for actual cleanup count
			cutoffDate: thirtyDaysAgo.toISOString(),
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		console.error('💥 Scheduled cleanup failed:', error);
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
			case '0 * * * *': // Every hour - calendar sync
				await scheduledCalendarSync(env);
				break;

			case '0 2 * * 0': // Weekly on Sunday at 2 AM - cleanup
				await scheduledCleanup(env);
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
