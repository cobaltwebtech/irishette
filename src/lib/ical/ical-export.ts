import { env } from 'cloudflare:workers';
import { and, eq, gte, lte } from 'drizzle-orm';

import { createDrizzle } from '@/db/drizzle-init';
import { bookings, room, roomBlockedPeriods } from '@/db/schema-export';
import { addDays } from '@/utils/date-range';
import { publicIdSchema } from '@/utils/ids';
import { todayIn } from '@/utils/timezone';

import { generateIcal } from './ical-generate';

// Export feed for Airbnb/Expedia/...: GET /api/ical/<room publicId>/<token>.ics
// The token is a per-room secret (room.ical_export_token). Any mismatch is a
// plain 404, so the response never reveals whether a room exists.
// The feed contains only confirmed direct bookings and admin blocks from 30
// days ago to 2 years ahead (see ical-generate.ts for the format).

const PATH = /^\/api\/ical\/([^/]+)\/([^/]+)\.ics$/;
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

const notFound = () =>
	new Response('Not found', {
		status: 404,
		headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
	});

async function sha256(value: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

/** Constant-time string comparison (hashing first hides the length). */
async function tokensMatch(a: string, b: string): Promise<boolean> {
	const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
	// Workers extension of SubtleCrypto (the DOM lib types don't declare it).
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
	};
	return subtle.timingSafeEqual(ha, hb);
}

/** Path of a room's export feed (append to the site origin). */
export const icalExportPath = (roomPublicId: string, token: string) =>
	`/api/ical/${roomPublicId}/${token}.ics`;

export async function handleIcalExportRequest(
	request: Request,
): Promise<Response> {
	const match = PATH.exec(new URL(request.url).pathname);
	if (!match) return notFound();
	const [, publicId, token] = match;
	if (!publicIdSchema.safeParse(publicId).success || !TOKEN.test(token)) {
		return notFound();
	}

	try {
		const db = createDrizzle(env.DB);
		const [roomRow] = await db
			.select({
				id: room.id,
				name: room.name,
				token: room.icalExportToken,
			})
			.from(room)
			.where(eq(room.publicId, publicId));
		// Compare even when the room is missing, so timing doesn't tell.
		const ok = await tokensMatch(token, roomRow?.token ?? '');
		if (!roomRow || !ok) return notFound();

		const today = todayIn();
		const from = addDays(today, -30);
		const to = addDays(today, 365 * 2);
		const [confirmed, blocks] = await Promise.all([
			db
				.select({
					publicId: bookings.publicId,
					checkInDate: bookings.checkInDate,
					checkOutDate: bookings.checkOutDate,
				})
				.from(bookings)
				.where(
					and(
						eq(bookings.roomId, roomRow.id),
						eq(bookings.status, 'confirmed'),
						gte(bookings.checkOutDate, from),
						lte(bookings.checkInDate, to),
					),
				)
				.orderBy(bookings.checkInDate),
			db
				.select({
					id: roomBlockedPeriods.id,
					startDate: roomBlockedPeriods.startDate,
					endDate: roomBlockedPeriods.endDate,
				})
				.from(roomBlockedPeriods)
				.where(
					and(
						eq(roomBlockedPeriods.roomId, roomRow.id),
						gte(roomBlockedPeriods.endDate, from),
						lte(roomBlockedPeriods.startDate, to),
					),
				)
				.orderBy(roomBlockedPeriods.startDate),
		]);

		const body = generateIcal({
			calendarName: `Irishette - ${roomRow.name}`,
			bookings: confirmed,
			blocks,
		});
		return new Response(body, {
			status: 200,
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': 'inline; filename="irishette.ics"',
				'Cache-Control': 'private, max-age=300',
			},
		});
	} catch (error) {
		console.error(
			'iCal export failed:',
			error instanceof Error ? error.message : 'Unknown error',
		);
		return new Response('Internal server error', {
			status: 500,
			headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
		});
	}
}
