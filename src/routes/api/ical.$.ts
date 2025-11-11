// import { getBindings } from '@/utils/bindings';
import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { iCalService } from '@/lib/ical-service';

export const Route = createFileRoute('/api/ical/$')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					// Security: Extract and validate roomId from URL pathname
					// Note: This endpoint is intentionally public for third-party calendar apps
					// (AirBnB, Expedia, etc.)
					const url = new URL(request.url);

					// Type guard for pathname
					if (!url.pathname || typeof url.pathname !== 'string') {
						console.error(
							'Invalid pathname:',
							url.pathname,
							'from URL:',
							request.url,
						);
						return new Response('Invalid URL pathname', {
							status: 400,
							headers: { 'Content-Type': 'text/plain' },
						});
					}

					// Defensive: ensure pathname is a string before splitting
					const pathname =
						typeof url.pathname === 'string'
							? url.pathname
							: String(url.pathname ?? '');
					console.debug?.(
						'DEBUG /api/ical pathname type:',
						typeof url.pathname,
						'value:',
						pathname,
					);
					const pathParts = pathname.split('/');
					let roomId = String(pathParts[pathParts.length - 1] ?? '').trim(); // Get the last part of the path

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

					// Security: Validate room ID format (prevent injection attacks)
					// Room IDs should be alphanumeric with hyphens and underscores
					if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
						console.warn('Invalid room ID format attempted:', roomId);
						return new Response('Invalid room ID format', {
							status: 400,
							headers: { 'Content-Type': 'text/plain' },
						});
					}

					// Security: Prevent excessive length
					if (roomId.length > 100) {
						return new Response('Room ID too long', {
							status: 400,
							headers: { 'Content-Type': 'text/plain' },
						});
					}

					// Create iCal service instance
					const icalService = new iCalService(env.DB);

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
		},
	},
});
