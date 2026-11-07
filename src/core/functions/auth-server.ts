import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';

/**
 * The only session shape that leaves the server. Never add the session
 * token, IP address or user agent here: it is dehydrated into the SSR HTML.
 */
export type SessionUser = {
	id: string;
	publicId: string;
	name: string;
	email: string;
	image: string | null;
	role: string | null;
	emailVerified: boolean;
	phoneNumber: string | null;
	createdAt: Date;
};

export type AppSession = { user: SessionUser } | null;

/**
 * Current session from the request cookies. Runs on the server (direct call
 * during SSR, RPC from the browser).
 *
 * `fresh: true` bypasses Better Auth's 5-minute cookie cache and reads the
 * session from the database (used by the admin layout).
 */
export const getSessionFn = createServerFn({ method: 'GET' })
	.validator(z.object({ fresh: z.boolean().optional() }).optional())
	.handler(async ({ data }): Promise<AppSession> => {
		const authInstance = await auth();
		const session = await authInstance.api.getSession({
			headers: getRequestHeaders(),
			query: data?.fresh ? { disableCookieCache: true } : undefined,
		});
		if (!session) return null;

		const { user } = session;
		return {
			user: {
				id: user.id,
				publicId: user.publicId,
				name: user.name,
				email: user.email,
				image: user.image ?? null,
				role: user.role ?? null,
				emailVerified: user.emailVerified,
				phoneNumber: user.phoneNumber ?? null,
				createdAt: user.createdAt,
			},
		};
	});
