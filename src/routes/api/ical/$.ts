import { createServerFileRoute } from '@tanstack/react-start/server';
import { iCalService } from '@/lib/ical-service';
import { getBindings } from '@/utils/bindings';

export const ServerRoute = createServerFileRoute('/api/ical/$').methods({
	GET: async ({ request }: { request: Request }) => {
		try {
			// Extract roomId from URL pathname
			const url = new URL(request.url);
			const pathParts = url.pathname.split('/');
			let roomId = pathParts[pathParts.length - 1]; // Get the last part of the path

			// Remove .ics extension if present
			if (roomId.endsWith('.ics')) {
				roomId = roomId.slice(0, -4);
			}

			if (!roomId || roomId === 'ical') {
				return new Response('Room ID is required', {
					status: 400,
					headers: { 'Content-Type': 'text/plain' },
				});
			}

			// Get Cloudflare bindings for database access
			const bindings = getBindings();

			// Create iCal service instance
			const icalService = new iCalService(bindings.DB);

			// Generate iCal content for the room
			const icalContent = await icalService.generateICalForRoom(roomId);

			// Return iCal content with proper headers
			return new Response(icalContent, {
				status: 200,
				headers: {
					'Content-Type': 'text/calendar; charset=utf-8',
					'Content-Disposition': `attachment; filename="room-${roomId}.ics"`,
					'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
				},
			});
		} catch (error) {
			console.error('Error generating iCal:', error);

			// Return appropriate error response
			if (error instanceof Error && error.message.includes('not found')) {
				return new Response('Room not found', {
					status: 404,
					headers: { 'Content-Type': 'text/plain' },
				});
			}

			return new Response('Internal server error', {
				status: 500,
				headers: { 'Content-Type': 'text/plain' },
			});
		}
	},
});
