import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';

// Better Auth handler for all HTTP methods
const authHandler = async ({
	request,
	params,
}: {
	request: Request;
	params: Record<string, string>;
}) => {
	console.log('AUTH API:', request.method, request.url, 'params:', params);
	try {
		const authInstance = await auth();
		console.log('Auth instance created successfully');
		return authInstance.handler(request);
	} catch (error) {
		console.error('Error in auth handler:', error);
		return new Response('Auth error', { status: 500 });
	}
};

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: authHandler,
			POST: authHandler,
			PUT: authHandler,
			DELETE: authHandler,
			PATCH: authHandler,
			OPTIONS: authHandler,
		},
	},
});
