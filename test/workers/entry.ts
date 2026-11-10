import { handleIcalExportRequest } from '@/lib/ical/ical-export';
// Test-only Worker entry for the `workers` Vitest project.
// The real entry (src/server.ts) wraps the TanStack Start handler, which needs
// the Start Vite plugin. This entry routes the plain HTTP endpoints that tests
// call through `exports.default.fetch()` to the same handlers the Start server
// routes use, and forwards cron triggers to the real scheduled handler.
import { handleCspReport } from '@/lib/security/csp-report';
import { handleScheduledEvent } from '@/lib/server/scheduled-tasks';
import { handleStripeWebhook } from '@/lib/stripe/stripe-webhook';

export default {
	fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (request.method === 'POST' && pathname === '/api/stripe/webhook') {
			return handleStripeWebhook(request, {
				env,
				waitUntil: (p) => ctx.waitUntil(p),
			});
		}
		if (request.method === 'POST' && pathname === '/api/csp-report') {
			return handleCspReport(request);
		}
		if (request.method === 'GET' && pathname.startsWith('/api/ical/')) {
			return handleIcalExportRequest(request);
		}
		return new Response('Not Found', { status: 404 });
	},

	async scheduled(controller, env, ctx) {
		await handleScheduledEvent(controller, env, ctx);
	},
} satisfies ExportedHandler<Env>;
