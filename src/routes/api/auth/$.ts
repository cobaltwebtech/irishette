import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';

export const ServerRoute = createServerFileRoute('/api/auth/$').methods({
	GET: ({ request }) => {
		const authInstance = auth();
		return authInstance.handler(request);
	},
	POST: ({ request }) => {
		const authInstance = auth();
		return authInstance.handler(request);
	},
});
