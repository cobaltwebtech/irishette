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
	 * Handles cron triggers for automated tasks:
	 */
	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		console.log('🔔 Scheduled event received in server.ts');
		await handleScheduledEvent(event, env, ctx);
	},
};