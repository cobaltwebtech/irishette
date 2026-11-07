import { createFileRoute, redirect } from '@tanstack/react-router';

import { freshSessionQueryOptions } from '@/lib/session';

/**
 * Pathless admin layout. Re-checks the session without Better Auth's cookie
 * cache (at most every 5 s) so a revoked admin role takes effect quickly.
 * Non-admins go to `/` (not to login, which would bounce back: a redirect
 * loop). tRPC `adminProcedure` is the real enforcement.
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
