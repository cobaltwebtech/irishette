import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createDrizzle } from '@/db/drizzle-init';
import { icalSyncLog, room, roomAvailability } from '@/db/schema-export';

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

			// Process each event
			for (const event of events) {
				const dates = this.getDateRange(event.startDate, event.endDate);

				for (const date of dates) {
					await this.db
						.insert(roomAvailability)
						.values({
							id: nanoid(),
							roomId,
							date,
							isAvailable: false,
							isBlocked: true,
							source: platform,
							externalBookingId: event.uid,
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [roomAvailability.roomId, roomAvailability.date],
							set: {
								isAvailable: false,
								isBlocked: true,
								source: platform,
								externalBookingId: event.uid,
								updatedAt: new Date(),
							},
						});
				}

				bookingsProcessed++;
			}

			// Update room sync timestamp
			const updateField =
				platform === 'airbnb' ? 'lastAirbnbSync' : 'lastExpediaSync';
			await this.db
				.update(room)
				.set({
					[updateField]: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(room.id, roomId));

			return { success: true, bookingsProcessed };
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, bookingsProcessed, errorMessage };
		} finally {
			// Log sync attempt
			await this.db.insert(icalSyncLog).values({
				id: nanoid(),
				roomId,
				platform,
				status: errorMessage ? 'error' : 'success',
				bookingsProcessed,
				errorMessage,
				syncDuration: Date.now() - syncStartTime,
				createdAt: new Date(),
			});
		}
	}

	/**
	 * Generate iCal content for our bookings
	 */
	async generateICalForRoom(roomId: string): Promise<string> {
		// Get all confirmed bookings for this room
		const bookingResults = await this.db
			.select({
				id: roomAvailability.id,
				date: roomAvailability.date,
				externalBookingId: roomAvailability.externalBookingId,
				source: roomAvailability.source,
			})
			.from(roomAvailability)
			.where(
				and(
					eq(roomAvailability.roomId, roomId),
					eq(roomAvailability.isBlocked, true),
					eq(roomAvailability.source, 'direct'),
				),
			);

		const icalLines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Irishette//Booking System//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
		];

		// Group consecutive dates into booking periods
		const bookingPeriods: { start: string; end: string; id: string }[] = [];
		let currentPeriod: { start: string; end: string; id: string } | null = null;

		const sortedBookings = bookingResults.sort((a, b) =>
			a.date.localeCompare(b.date),
		);

		for (const booking of sortedBookings) {
			if (!currentPeriod) {
				currentPeriod = {
					start: booking.date,
					end: booking.date,
					id: booking.id,
				};
			} else {
				const currentDate = new Date(booking.date);
				const lastDate = new Date(currentPeriod.end);
				lastDate.setDate(lastDate.getDate() + 1);

				if (currentDate.getTime() === lastDate.getTime()) {
					// Consecutive date, extend period
					currentPeriod.end = booking.date;
				} else {
					// Gap found, save current period and start new one
					bookingPeriods.push({ ...currentPeriod });
					currentPeriod = {
						start: booking.date,
						end: booking.date,
						id: booking.id,
					};
				}
			}
		}

		if (currentPeriod) {
			bookingPeriods.push(currentPeriod);
		}

		// Add events for each booking period
		for (const period of bookingPeriods) {
			const startDate = period.start.replace(/-/g, '');
			const endDateObj = new Date(period.end);
			endDateObj.setDate(endDateObj.getDate() + 1); // iCal end date is exclusive
			const endDate = endDateObj.toISOString().split('T')[0].replace(/-/g, '');
			const now =
				new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

			icalLines.push(
				'BEGIN:VEVENT',
				`UID:${period.id}@irishette.com`,
				`DTSTART;VALUE=DATE:${startDate}`,
				`DTEND;VALUE=DATE:${endDate}`,
				`DTSTAMP:${now}`,
				'SUMMARY:Booked',
				'DESCRIPTION:This property is not available',
				'STATUS:CONFIRMED',
				'TRANSP:OPAQUE',
				'END:VEVENT',
			);
		}

		icalLines.push('END:VCALENDAR');
		return icalLines.join('\r\n');
	}
}
