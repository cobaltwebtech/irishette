// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import handler from '@tanstack/react-start/server-entry';
import { handleScheduledEvent } from '@/lib/scheduled-tasks';

console.log("[server-entry]: using custom server entry in 'src/server.ts'");

export default {
	fetch(request: Request, _env: Env, _ctx: ExecutionContext) {
		return handler.fetch(request, {
			context: {
				fromFetch: true,
			},
		});
	},

	/**
	 * Cloudflare Workers scheduled event handler
	 * Handles cron triggers for automated tasks
	 * 
	 * Note: Using fire-and-forget pattern to avoid Cloudflare's async timeout behavior.
	 * The handler executes synchronously but doesn't wait for the promise to prevent
	 * the ~7 minute wall time issue caused by async promise resolution waiting.
	 */
	scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): void {
		console.log('🔔 Scheduled event received in server.ts');
		handleScheduledEvent(event, env, _ctx).then(
			() => console.log('✨ Scheduled event handler completed successfully'),
			(error) => console.error('❌ Scheduled event handler failed:', error),
		);
	},
};
