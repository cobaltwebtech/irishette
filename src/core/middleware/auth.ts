import { createMiddleware } from '@tanstack/react-start';
import {
	getRequestHeaders,
	setResponseStatus,
} from '@tanstack/react-start/server';

import { authorizeRequest, ServerFnAuthError } from '@/lib/server-auth';
import type { SessionUser } from '@/lib/session-user';

// Function middleware for TanStack Start server functions that read or write
// private data. Attach per function, never globally (getSessionFn is public):
//
//   createServerFn({ method: 'POST' })
//     .middleware([requireSessionMiddleware])   // or requireAdminMiddleware
//     .validator(schema)
//     .handler(({ context }) => ... context.user ...)
//
// Route guards (src/lib/auth-check.ts) are UX only and do not protect server
// functions. Failures answer 401 (signed out) or 403 (banned / not an admin).
// The checks live in src/lib/server-auth.ts (same rules as tRPC's
// protectedProcedure / adminProcedure).

async function authorize(level: 'user' | 'admin'): Promise<SessionUser> {
	try {
		return await authorizeRequest(getRequestHeaders(), level);
	} catch (error) {
		if (error instanceof ServerFnAuthError) setResponseStatus(error.status);
		throw error;
	}
}

/** Signed in and not banned. Adds `context.user` (SessionUser). */
export const requireSessionMiddleware = createMiddleware({
	type: 'function',
}).server(async ({ next }) =>
	next({ context: { user: await authorize('user') } }),
);

/** An unbanned admin (role read from D1). Adds `context.user` (SessionUser). */
export const requireAdminMiddleware = createMiddleware({
	type: 'function',
}).server(async ({ next }) =>
	next({ context: { user: await authorize('admin') } }),
);
