// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import handler from '@tanstack/react-start/server-entry';
import { handleScheduledEvent } from '@/lib/scheduled-tasks';

console.log("[server-entry]: using custom server entry in 'src/server.ts'");

export default {
	fetch(request: Request, _env: Env, _ctx: ExecutionContext) {
		return handler.fetch(request);
	},

	/**
	 * Cloudflare Workers scheduled event handler
	 * Handles cron triggers for automated tasks
	 * 
	 * Note: Fire-and-forget with explicit void return to minimize wall time.
	 */
	scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
		console.log('🔔 Scheduled event received in server.ts');
		
		// Execute but don't await - handler returns immediately
		void handleScheduledEvent(event, env, ctx)
			.then(() => console.log('✨ Scheduled event handler completed successfully'))
			.catch((error) => console.error('❌ Scheduled event handler failed:', error));
		
		return;
	},
};
