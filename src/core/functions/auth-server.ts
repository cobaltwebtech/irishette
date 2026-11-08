import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';

import { getAuthSession } from '@/lib/server-auth';
import { type AppSession, toSessionUser } from '@/lib/session-user';

/**
 * Current session from the request cookies (public: signed-out callers get
 * null). Runs on the server (direct call during SSR, RPC from the browser).
 * Only the SessionUser shape leaves the server.
 *
 * `fresh: true` bypasses Better Auth's 5-minute cookie cache and reads the
 * session from the database (used by the admin layout).
 *
 * Server functions that read or write private data must use
 * requireSessionMiddleware / requireAdminMiddleware (src/core/middleware/auth.ts).
 */
export const getSessionFn = createServerFn({ method: 'GET' })
	.validator(z.object({ fresh: z.boolean().optional() }).optional())
	.handler(async ({ data }): Promise<AppSession> => {
		const session = await getAuthSession(getRequestHeaders(), {
			fresh: data?.fresh,
		});
		return session ? { user: toSessionUser(session.user) } : null;
	});
