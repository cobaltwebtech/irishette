import { createFileRoute } from '@tanstack/react-router';

import { requireAdmin } from '@/lib/auth-check';

/**
 * Pathless admin layout (UX guard, see requireAdmin). The real enforcement is
 * tRPC `adminProcedure` (and requireAdminMiddleware for server functions),
 * which re-reads the role from D1 on every call.
 */
export const Route = createFileRoute('/_authed/_admin')({
	beforeLoad: async (ctx) => ({ user: await requireAdmin(ctx) }),
});
