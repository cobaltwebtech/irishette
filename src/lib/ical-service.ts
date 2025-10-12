import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createDrizzle } from '@/db/drizzle-init';
import {
	bookings,
	icalSyncLog,
	room,
	roomAvailability,
	roomBlockedPeriods,
} from '@/db/schema-export';

interface CalendarEvent {
	uid: string;
	summary: string;
	startDate: string;
	endDate: string;
	dtStamp: string;
}

export class iCalService {
	private db: ReturnType<typeof createDrizzle>;

	constructor(database: D1Database) {
		this.db = createDrizzle(database);
	}

	/**
	 * Parse iCal content and extract booking events
	 */
	private parseICalContent(icalContent: string): CalendarEvent[] {
		const events: CalendarEvent[] = [];
		const lines = icalContent.split('\n').map((line) => line.trim());

		let currentEvent: Partial<CalendarEvent> = {};
		let inEvent = false;

		for (const line of lines) {
			if (line === 'BEGIN:VEVENT') {
				inEvent = true;
				currentEvent = {};
			} else if (line === 'END:VEVENT' && inEvent) {
				if (
					currentEvent.uid &&
					currentEvent.startDate &&
					currentEvent.endDate
				) {
					events.push(currentEvent as CalendarEvent);
				}
				inEvent = false;
			} else if (inEvent) {
				if (line.startsWith('UID:')) {
					currentEvent.uid = line.substring(4);
				} else if (line.startsWith('SUMMARY:')) {
					currentEvent.summary = line.substring(8);
				} else if (line.startsWith('DTSTART')) {
					const dateMatch = line.match(/:\d{8}/);
					if (dateMatch) {
						const dateStr = dateMatch[0].substring(1);
						currentEvent.startDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
					}
				} else if (line.startsWith('DTEND')) {
					const dateMatch = line.match(/:\d{8}/);
					if (dateMatch) {
						const dateStr = dateMatch[0].substring(1);
						currentEvent.endDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
					}
				} else if (line.startsWith('DTSTAMP:')) {
					currentEvent.dtStamp = line.substring(8);
				}
			}
		}

		return events;
	}

	/**
	 * Generate date range between start and end dates
	 */
	private getDateRange(startDate: string, endDate: string): string[] {
		const dates: string[] = [];
		const start = new Date(startDate);
		const end = new Date(endDate);

		// Don't include the end date for availability blocking
		while (start < end) {
			dates.push(start.toISOString().split('T')[0]);
			start.setDate(start.getDate() + 1);
		}

		return dates;
	}

	/**
	 * Sync external calendar for a specific room and platform
	 */
	async syncExternalCalendar(
		roomId: string,
		platform: 'airbnb' | 'expedia',
	): Promise<{
		success: boolean;
		bookingsProcessed: number;
		errorMessage?: string;
	}> {
		const syncStartTime = Date.now();
		let bookingsProcessed = 0;
		let errorMessage: string | undefined;

		try {
			// Get room data
			const roomResult = await this.db
				.select()
				.from(room)
				.where(eq(room.id, roomId));

			if (!roomResult[0]) {
				throw new Error('Room not found');
			}

			const roomData = roomResult[0];

			// Get calendar URL from database
			const calendarUrl =
				platform === 'airbnb'
					? roomData.airbnbIcalUrl
					: roomData.expediaIcalUrl;

			if (!calendarUrl) {
				throw new Error(`No ${platform} calendar URL configured`);
			}

			// Fetch iCal data
			const response = await fetch(calendarUrl, {
				headers: {
					'User-Agent': 'Irishette Calendar Sync/1.0',
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch calendar: ${response.statusText}`);
			}

			const icalContent = await response.text();
			const events = this.parseICalContent(icalContent);

			// Remove existing availability records for this platform
			await this.db
				.delete(roomAvailability)
				.where(
					and(
						eq(roomAvailability.roomId, roomId),
						eq(roomAvailability.source, platform),
					),
				);

			// Process events and collect all dates to block
			const now = new Date();
			const datesToBlock = new Map<string, string>(); // date -> externalBookingId

			for (const event of events) {
				const dates = this.getDateRange(event.startDate, event.endDate);

				for (const date of dates) {
					// If date already exists, keep the first booking ID
					if (!datesToBlock.has(date)) {
						datesToBlock.set(date, event.uid);
					}
				}

				bookingsProcessed++;
			}

			// Insert/update availability records
			// Note: Each insert must be separate due to onConflictDoUpdate
			let insertErrors = 0;
			for (const [date, externalBookingId] of datesToBlock) {
				try {
					await this.db
						.insert(roomAvailability)
						.values({
							id: nanoid(),
							roomId,
							date,
							isAvailable: false,
							isBlocked: true,
							source: platform,
							externalBookingId,
							createdAt: now,
							updatedAt: now,
						})
						.onConflictDoUpdate({
							target: [roomAvailability.roomId, roomAvailability.date],
							set: {
								isAvailable: false,
								isBlocked: true,
								source: platform,
								externalBookingId,
								updatedAt: now,
							},
						});
				} catch (insertError) {
					insertErrors++;
					// Log but continue processing other dates
					if (insertErrors === 1) {
						// Only log the first error to avoid spam
						console.warn(
							`⚠️ Error inserting availability for ${date}:`,
							insertError instanceof Error
								? insertError.message.substring(0, 100)
								: 'Unknown',
						);
					}
				}
			}

			// If we had too many insert errors, consider it a failure
			if (insertErrors > datesToBlock.size * 0.5) {
				throw new Error(
					`Too many insert errors (${insertErrors}/${datesToBlock.size})`,
				);
			} else if (insertErrors > 0) {
				console.warn(
					`⚠️ Completed with ${insertErrors} errors out of ${datesToBlock.size} dates`,
				);
			}

			// Update room sync timestamp
			const updateField =
				platform === 'airbnb' ? 'lastAirbnbSync' : 'lastExpediaSync';
			const syncTime = new Date();
			await this.db
				.update(room)
				.set({
					[updateField]: syncTime,
					updatedAt: syncTime,
				})
				.where(eq(room.id, roomId));

			return { success: true, bookingsProcessed };
		} catch (error) {
			// Extract a clean error message, avoiding nested SQL queries
			let cleanErrorMessage = 'Unknown error';
			if (error instanceof Error) {
				// If it's a database error, extract just the first line/core message
				const fullMessage = error.message;
				if (fullMessage.includes('Failed query:')) {
					// Extract just the error type, not the full SQL
					const match = fullMessage.match(/^([^:]+):/);
					cleanErrorMessage = match
						? match[1]
						: 'Database operation failed';
				} else {
					cleanErrorMessage = fullMessage;
				}
			}
			// Ensure message is reasonably short
			errorMessage =
				cleanErrorMessage.length > 200
					? `${cleanErrorMessage.substring(0, 200)}...`
					: cleanErrorMessage;

			return { success: false, bookingsProcessed, errorMessage };
		} finally {
			// Log sync attempt with error handling
			try {
				// Further truncate for database storage (max 150 chars to be safe)
				const truncatedError = errorMessage
					? errorMessage.length > 150
						? `${errorMessage.substring(0, 150)}...`
						: errorMessage
					: undefined;

				await this.db.insert(icalSyncLog).values({
					id: nanoid(),
					roomId,
					platform,
					status: errorMessage ? 'error' : 'success',
					bookingsProcessed,
					errorMessage: truncatedError,
					syncDuration: Date.now() - syncStartTime,
					createdAt: new Date(),
				});
			} catch (logError) {
				// If logging fails, just console.error it - don't throw
				// Extract just the core error, not nested SQL
				const logErrorMsg =
					logError instanceof Error
						? logError.message.includes('Failed query:')
							? 'Database logging failed'
							: logError.message.substring(0, 100)
						: 'Unknown logging error';
				console.error(`Failed to log sync result for ${platform}:`, logErrorMsg);
			}
		}
	}

	/**
	 * Generate iCal content for our bookings and blocked periods
	 */
	async generateICalForRoom(roomId: string): Promise<string> {
		// First, check if the room exists
		const roomExists = await this.db
			.select()
			.from(room)
			.where(eq(room.id, roomId))
			.limit(1);

		if (roomExists.length === 0) {
			throw new Error(`Room with ID ${roomId} not found`);
		}

		// Get all confirmed bookings for this room
		const confirmedBookings = await this.db
			.select({
				id: bookings.id,
				confirmationId: bookings.confirmationId,
				checkInDate: bookings.checkInDate,
				checkOutDate: bookings.checkOutDate,
				guestName: bookings.guestName,
				status: bookings.status,
			})
			.from(bookings)
			.where(
				and(eq(bookings.roomId, roomId), eq(bookings.status, 'confirmed')),
			);

		// Get all blocked periods for this room
		const blockedPeriods = await this.db
			.select({
				id: roomBlockedPeriods.id,
				startDate: roomBlockedPeriods.startDate,
				endDate: roomBlockedPeriods.endDate,
				reason: roomBlockedPeriods.reason,
				notes: roomBlockedPeriods.notes,
			})
			.from(roomBlockedPeriods)
			.where(eq(roomBlockedPeriods.roomId, roomId));

		const icalLines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Irishette//Booking System//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
		];

		const now = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

		// Add events for confirmed bookings
		for (const booking of confirmedBookings) {
			const startDate = booking.checkInDate.replace(/-/g, '');
			const endDate = booking.checkOutDate.replace(/-/g, '');

			icalLines.push(
				'BEGIN:VEVENT',
				`UID:booking-${booking.id}@irishette.com`,
				`DTSTART;VALUE=DATE:${startDate}`,
				`DTEND;VALUE=DATE:${endDate}`,
				`DTSTAMP:${now}`,
				`SUMMARY:Booked - ${booking.guestName}`,
				`DESCRIPTION:Booking confirmed (${booking.confirmationId})`,
				'STATUS:CONFIRMED',
				'TRANSP:OPAQUE',
				'END:VEVENT',
			);
		}

		// Add events for blocked periods
		for (const period of blockedPeriods) {
			const startDate = period.startDate.replace(/-/g, '');
			const endDateObj = new Date(period.endDate);
			endDateObj.setDate(endDateObj.getDate() + 1); // iCal end date is exclusive
			const endDate = endDateObj.toISOString().split('T')[0].replace(/-/g, '');

			const description = period.notes
				? `${period.reason} - ${period.notes}`
				: period.reason;

			icalLines.push(
				'BEGIN:VEVENT',
				`UID:blocked-${period.id}@irishette.com`,
				`DTSTART;VALUE=DATE:${startDate}`,
				`DTEND;VALUE=DATE:${endDate}`,
				`DTSTAMP:${now}`,
				`SUMMARY:Blocked - ${period.reason}`,
				`DESCRIPTION:${description}`,
				'STATUS:CONFIRMED',
				'TRANSP:OPAQUE',
				'END:VEVENT',
			);
		}

		icalLines.push('END:VCALENDAR');
		return icalLines.join('\r\n');
	}

	/**
	 * Get the iCal URL for a specific room
	 */
	static getICalUrl(roomId: string, baseUrl?: string): string {
		const domain = baseUrl || 'https://irishette.com';
		return `${domain}/api/ical/${roomId}.ics`;
	}

	/**
	 * Validate that a room exists and is active
	 */
	async validateRoom(roomId: string): Promise<boolean> {
		const roomResult = await this.db
			.select()
			.from(room)
			.where(and(eq(room.id, roomId), eq(room.isActive, true)))
			.limit(1);

		return roomResult.length > 0;
	}
}
