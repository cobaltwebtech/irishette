// DO NOT DELETE THIS FILE!!!
// Custom Worker entry: HTTP requests go to TanStack Start; cron triggers go to
// handleScheduledEvent. Server code reads bindings with
// `import { env, waitUntil } from 'cloudflare:workers'`, so no request context
// is passed to the Start handler.
import handler from '@tanstack/react-start/server-entry';
import { handleScheduledEvent } from '@/lib/scheduled-tasks';

export default {
	fetch(request) {
		return handler.fetch(request);
	},

	/**
	 * Cron triggers (see cloudflare.config.ts and src/lib/scheduled-tasks.ts).
	 */
	async scheduled(controller, env, ctx) {
		await handleScheduledEvent(controller, env, ctx);
	},
} satisfies ExportedHandler<Env>;
