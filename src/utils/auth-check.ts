import { redirect } from '@tanstack/react-router';
import { getServerSession } from '@/core/functions/auth-server';

/**
 * Requires user to be authenticated.
 * Use this in beforeLoad for protected routes.
 * Redirects to login with return URL if not authenticated.
 *
 * This function uses server-side session checking with proper SSR support.
 * It accesses request headers/cookies to validate the session on the server.
 *
 * @example
 * export const Route = createFileRoute('/account/')({
 *   beforeLoad: async ({ location }) => {
 *     const session = await requireAuth(location);
 *     return { session };
 *   },
 * });
 */
export async function requireAuth(location: {
	pathname: string;
	href?: string;
	search: Record<string, unknown>;
}) {
	// Check session server-side with proper request headers
	// This runs on the server in TanStack Start, ensuring secure auth check
	const session = await getServerSession();

	if (!session) {
		// Redirect to login with return URL
		throw redirect({
			to: '/auth/login',
			search: {
				redirect: location.href || location.pathname,
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
 *   beforeLoad: async ({ location }) => {
 *     const session = await requireAdmin(location);
 *     return { session };
 *   },
 * });
 */
export async function requireAdmin(location: {
	pathname: string;
	href?: string;
	search: Record<string, unknown>;
}) {
	// First check if user is authenticated
	const session = await requireAuth(location);

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
 *   beforeLoad: async () => {
 *     const session = await optionalAuth();
 *     return { session };
 *   },
 * });
 */
export async function optionalAuth() {
	// Check session server-side with proper request headers
	// Returns null if not authenticated (doesn't redirect)
	const session = await getServerSession();

	return session;
}

/**
 * Prevents authenticated users from accessing auth pages (login, signup, etc).
 * Use this in beforeLoad for auth routes.
 * Redirects to account or specified destination if already logged in.
 *
 * @example
 * export const Route = createFileRoute('/auth/login')({
 *   validateSearch: (search: Record<string, unknown>) => ({
 *     redirect: (search.redirect as string) || '/account',
 *   }),
 *   beforeLoad: async ({ search }) => {
 *     await requireNoSession(search.redirect);
 *   },
 * });
 */
export async function requireNoSession(redirectTo: string = '/account') {
	// Check if user is already logged in (server-side with proper headers)
	const session = await getServerSession();

	if (session) {
		// Redirect to account or the intended destination
		throw redirect({
			to: redirectTo,
		});
	}
}
