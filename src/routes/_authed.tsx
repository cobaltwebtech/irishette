import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Pathless layout for signed-in pages (/account/*, /booking/confirmation/*,
 * /admin/* via _authed/_admin). Route guards are UX only: every tRPC procedure
 * behind these pages enforces auth on the server.
 */
export const Route = createFileRoute('/_authed')({
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({
				to: '/auth/login',
				search: { redirect: location.href },
			});
		}
		return { user: context.session.user };
	},
});
