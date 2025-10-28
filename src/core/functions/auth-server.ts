import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';

/**
 * Server function to get the current session
 * This properly handles SSR by accessing the request headers and cookies
 */
export const getServerSession = createServerFn().handler(async () => {
	const authInstance = await auth();
	const session = await authInstance.api.getSession({
		headers: await import('@tanstack/react-start/server').then((m) =>
			m.getRequestHeaders(),
		),
	});

	return session;
});
