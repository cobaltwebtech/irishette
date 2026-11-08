import { createFileRoute, redirect } from '@tanstack/react-router';

import { freshSessionQueryOptions } from '@/lib/session';

/**
 * Pathless admin layout (UX guard). Reads the session without Better Auth's
 * cookie cache: on every SSR page load, and at most every 30 minutes during
 * client navigation (freshSessionQueryOptions). The real enforcement is
 * tRPC `adminProcedure`, which re-reads the role from D1 on every call; a
 * FORBIDDEN answer refreshes this session and re-runs the guard.
 * Non-admins go to `/` (not to login, which would bounce back: a redirect
 * loop).
 */
export const Route = createFileRoute('/_authed/_admin')({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.fetchQuery(
			freshSessionQueryOptions(),
		);
		if (!session) {
			throw redirect({
				to: '/auth/login',
				search: { redirect: location.href },
			});
		}
		if (session.user.role !== 'admin') {
			throw redirect({ to: '/' });
		}
		return { user: session.user };
	},
});
