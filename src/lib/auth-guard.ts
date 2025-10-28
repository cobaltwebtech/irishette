import { redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

/**
 * Requires user to be authenticated.
 * Use this in beforeLoad for protected routes.
 * Redirects to login with return URL if not authenticated.
 *
 * This function checks the session that was preloaded in the root route,
 * which helps prevent the redirect flash on page refreshes.
 *
 * @example
 * export const Route = createFileRoute('/account/')({
 *   beforeLoad: async ({ location, context }) => {
 *     const session = await requireAuth(location, context);
 *     return { session };
 *   },
 * });
 */
export async function requireAuth(
	location: {
		pathname: string;
		search: Record<string, unknown>;
	},
	context?: {
		session?: Awaited<ReturnType<typeof authClient.getSession>>['data'] | null;
	},
) {
	// First, check if session is available from the parent route context
	// This is preloaded in __root.tsx to prevent redirect flash
	let session = context?.session;

	// If not in context, fetch it (this shouldn't normally happen if __root is set up correctly)
	if (session === undefined) {
		const { data, error } = await authClient.getSession();
		session = error ? null : data;
	}

	if (!session) {
		throw redirect({
			to: '/auth/login',
			search: {
				redirect: location.pathname,
			},
		});
	}

	return session;
}

/**
 * Requires user to be authenticated AND have admin role.
 * Use this in beforeLoad for admin-only routes.
 * Redirects to login if not authenticated, or home if not admin.
 *
 * @example
 * export const Route = createFileRoute('/admin/$page')({
 *   beforeLoad: async ({ location, context }) => {
 *     const session = await requireAdmin(location, context);
 *     return { session };
 *   },
 * });
 */
export async function requireAdmin(
	location: {
		pathname: string;
		search: Record<string, unknown>;
	},
	context?: {
		session?: Awaited<ReturnType<typeof authClient.getSession>>['data'] | null;
	},
) {
	// First check if user is authenticated
	const session = await requireAuth(location, context);

	// Then check if user has admin role
	const isAdmin = session.user.role === 'admin';

	if (!isAdmin) {
		throw redirect({
			to: '/',
			search: {
				error: 'unauthorized',
			},
		});
	}

	return session;
}

/**
 * Optional auth check - doesn't redirect, just returns session or null.
 * Useful for pages that have different content for logged-in vs logged-out users.
 *
 * @example
 * export const Route = createFileRoute('/')({
 *   beforeLoad: async ({ context }) => {
 *     const session = await optionalAuth(context);
 *     return { session };
 *   },
 * });
 */
export async function optionalAuth(context?: {
	session?: Awaited<ReturnType<typeof authClient.getSession>>['data'] | null;
}) {
	// First, check if session is available from the parent route context
	let session = context?.session;

	// If not in context, fetch it
	if (session === undefined) {
		const { data } = await authClient.getSession();
		session = data ?? null;
	}

	return session;
}
