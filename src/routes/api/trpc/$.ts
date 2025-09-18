import { createServerFileRoute } from '@tanstack/react-start/server';
import type { TRPCContext } from '@/integrations/trpc/init';
import { trpcRouter } from '@/integrations/trpc/router';
import { getBindings } from '@/utils/bindings';

// Server route for tRPC API
export const ServerRoute = createServerFileRoute('/api/trpc/$').methods({
	GET: ({ request }) => {
		return handleTRPCRequest(request);
	},
	POST: ({ request }) => {
		return handleTRPCRequest(request);
	},
});

async function handleTRPCRequest(request: Request): Promise<Response> {
	try {
		// Get the Cloudflare bindings using the helper function
		const bindings = getBindings();

		// Create tRPC context
		const context: TRPCContext = {
			db: bindings.DB,
			kv: bindings.KV_SESSIONS,
		};

		// Extract procedure path from URL
		const urlObj = new URL(request.url);
		const procedurePath = urlObj.pathname.replace('/api/trpc/', '');

		// Parse input based on request method
		let input: unknown;

		if (request.method === 'GET') {
			// For GET requests, parse input from query parameter
			const inputParam = urlObj.searchParams.get('input');
			if (inputParam) {
				try {
					const parsed = JSON.parse(decodeURIComponent(inputParam));
					input = parsed.json || parsed; // Extract json property if it exists
				} catch (e) {
					console.error('Failed to parse GET input:', e);
				}
			}
		} else if (request.method === 'POST') {
			// For POST requests, parse input from request body
			try {
				const bodyText = await request.text();
				if (bodyText) {
					const parsed = JSON.parse(bodyText);
					input = parsed.json || parsed; // Extract json property if it exists
				}
			} catch (e) {
				console.error('Failed to parse POST body:', e);
			}
		}

		// Route to the appropriate procedure
		try {
			let result: unknown;

			// Parse the procedure path (e.g., "rooms.list" -> ["rooms", "list"])
			const pathParts = procedurePath.split('.');
			if (pathParts.length !== 2) {
				throw new Error(`Invalid procedure path: ${procedurePath}`);
			}

			const [routerName, procedureName] = pathParts;

			// Create a tRPC caller with the context
			const caller = trpcRouter.createCaller(context);

			// Call the appropriate procedure directly using the caller
			if (routerName === 'rooms') {
				if (procedureName === 'list') {
					result = await caller.rooms.list(
						input as Parameters<typeof caller.rooms.list>[0],
					);
				} else if (procedureName === 'ping') {
					result = await caller.rooms.ping();
				} else if (procedureName === 'create') {
					result = await caller.rooms.create(
						input as Parameters<typeof caller.rooms.create>[0],
					);
				} else if (procedureName === 'get') {
					result = await caller.rooms.get(
						input as Parameters<typeof caller.rooms.get>[0],
					);
				} else if (procedureName === 'update') {
					result = await caller.rooms.update(
						input as Parameters<typeof caller.rooms.update>[0],
					);
				} else if (procedureName === 'archive') {
					result = await caller.rooms.archive(
						input as Parameters<typeof caller.rooms.archive>[0],
					);
				} else if (procedureName === 'activate') {
					result = await caller.rooms.activate(
						input as Parameters<typeof caller.rooms.activate>[0],
					);
				} else if (procedureName === 'deactivate') {
					result = await caller.rooms.deactivate(
						input as Parameters<typeof caller.rooms.deactivate>[0],
					);
				} else if (procedureName === 'testIcalUrl') {
					result = await caller.rooms.testIcalUrl(
						input as Parameters<typeof caller.rooms.testIcalUrl>[0],
					);
				} else if (procedureName === 'updateIcalUrls') {
					result = await caller.rooms.updateIcalUrls(
						input as Parameters<typeof caller.rooms.updateIcalUrls>[0],
					);
				} else if (procedureName === 'syncCalendar') {
					result = await caller.rooms.syncCalendar(
						input as Parameters<typeof caller.rooms.syncCalendar>[0],
					);
				} else if (procedureName === 'getPricingRules') {
					result = await caller.rooms.getPricingRules(
						input as Parameters<typeof caller.rooms.getPricingRules>[0],
					);
				} else if (procedureName === 'createPricingRule') {
					result = await caller.rooms.createPricingRule(
						input as Parameters<typeof caller.rooms.createPricingRule>[0],
					);
				} else if (procedureName === 'updatePricingRule') {
					result = await caller.rooms.updatePricingRule(
						input as Parameters<typeof caller.rooms.updatePricingRule>[0],
					);
				} else if (procedureName === 'deletePricingRule') {
					result = await caller.rooms.deletePricingRule(
						input as Parameters<typeof caller.rooms.deletePricingRule>[0],
					);
				} else if (procedureName === 'calculatePricing') {
					result = await caller.rooms.calculatePricing(
						input as Parameters<typeof caller.rooms.calculatePricing>[0],
					);
				} else {
					throw new Error(`Unknown procedure: ${procedureName}`);
				}
			} else if (routerName === 'bookings') {
				if (procedureName === 'calculateBooking') {
					result = await caller.bookings.calculateBooking(
						input as Parameters<typeof caller.bookings.calculateBooking>[0],
					);
				} else if (procedureName === 'createBooking') {
					result = await caller.bookings.createBooking(
						input as Parameters<typeof caller.bookings.createBooking>[0],
					);
				} else if (procedureName === 'createCheckoutSession') {
					result = await caller.bookings.createCheckoutSession(
						input as Parameters<
							typeof caller.bookings.createCheckoutSession
						>[0],
					);
				} else if (procedureName === 'getBooking') {
					result = await caller.bookings.getBooking(
						input as Parameters<typeof caller.bookings.getBooking>[0],
					);
				} else if (procedureName === 'getMyBookings') {
					result = await caller.bookings.getMyBookings(
						input as Parameters<typeof caller.bookings.getMyBookings>[0],
					);
				} else if (procedureName === 'updateBooking') {
					result = await caller.bookings.updateBooking(
						input as Parameters<typeof caller.bookings.updateBooking>[0],
					);
				} else if (procedureName === 'cancelBooking') {
					result = await caller.bookings.cancelBooking(
						input as Parameters<typeof caller.bookings.cancelBooking>[0],
					);
				} else if (procedureName === 'adminListBookings') {
					result = await caller.bookings.adminListBookings(
						input as Parameters<typeof caller.bookings.adminListBookings>[0],
					);
				} else if (procedureName === 'adminGetStats') {
					result = await caller.bookings.adminGetStats();
				} else {
					throw new Error(`Unknown procedure: ${procedureName}`);
				}
			} else if (routerName === 'availability') {
				if (procedureName === 'checkRoom') {
					result = await caller.availability.checkRoom(
						input as Parameters<typeof caller.availability.checkRoom>[0],
					);
				} else if (procedureName === 'checkBulk') {
					result = await caller.availability.checkBulk(
						input as Parameters<typeof caller.availability.checkBulk>[0],
					);
				} else if (procedureName === 'syncCalendar') {
					result = await caller.availability.syncCalendar(
						input as Parameters<typeof caller.availability.syncCalendar>[0],
					);
				} else if (procedureName === 'syncAllCalendars') {
					result = await caller.availability.syncAllCalendars(
						input as Parameters<typeof caller.availability.syncAllCalendars>[0],
					);
				} else if (procedureName === 'getCalendar') {
					result = await caller.availability.getCalendar(
						input as Parameters<typeof caller.availability.getCalendar>[0],
					);
				} else if (procedureName === 'getSyncLogs') {
					result = await caller.availability.getSyncLogs(
						input as Parameters<typeof caller.availability.getSyncLogs>[0],
					);
				} else if (procedureName === 'getBySlug') {
					result = await caller.availability.getBySlug(
						input as Parameters<typeof caller.availability.getBySlug>[0],
					);
				} else {
					throw new Error(`Unknown procedure: ${procedureName}`);
				}
			} else {
				throw new Error(`Unknown router: ${routerName}`);
			}

			// Return the result in tRPC format
			return new Response(
				JSON.stringify({
					result: {
						data: result,
					},
				}),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json',
					},
				},
			);
		} catch (error) {
			console.error('tRPC procedure error:', procedurePath, error);

			// Return error in tRPC format
			return new Response(
				JSON.stringify({
					error: {
						json: {
							message: error instanceof Error ? error.message : 'Unknown error',
							code: -32600,
							data: {
								code: 'BAD_REQUEST',
								httpStatus: 400,
							},
						},
					},
				}),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				},
			);
		}
	} catch (error) {
		console.error('tRPC handler error:', error);
		return new Response(JSON.stringify({ error: 'tRPC error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}
