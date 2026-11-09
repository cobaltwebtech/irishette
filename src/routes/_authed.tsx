import { createFileRoute } from '@tanstack/react-router';

import { requireAuth } from '@/lib/auth-check';

/**
 * Pathless layout for signed-in pages (/account/*, /booking/confirmation/*,
 * /admin/* via _authed/_admin). Route guards are UX only: every tRPC procedure
 * (and every private server function) behind these pages enforces auth on
 * the server.
 */
export const Route = createFileRoute('/_authed')({
	beforeLoad: async (ctx) => ({ user: await requireAuth(ctx) }),
});
