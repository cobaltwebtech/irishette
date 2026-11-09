import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError, z } from 'zod';

import {
	actorKey,
	clientIp,
	isRateLimited,
	type RateLimiterName,
} from '@/lib/rate-limit';

import { isActiveAdmin, isBanActive } from './access';
import type { TRPCContext } from './inner-context';

/**
 * Reads a structured field from a TRPCError cause. tRPC copies the properties
 * of a plain-object `cause` onto the error it wraps it in, so
 * `throw new TRPCError({ code: 'CONFLICT', cause: { conflict } })` arrives here
 * as `error.cause.conflict`.
 */
function causeField(cause: unknown, key: 'conflict' | 'conflicts'): unknown {
	if (cause && typeof cause === 'object' && key in cause) {
		return (cause as Record<string, unknown>)[key] ?? null;
	}
	return null;
}

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		// Unexpected errors (plain Error, SQL, Stripe) never reach the client
		// verbatim; the server logs them (src/routes/api/trpc.$.ts).
		const internal = error.code === 'INTERNAL_SERVER_ERROR';
		return {
			...shape,
			message: internal
				? 'Something went wrong. Please try again.'
				: shape.message,
			data: {
				...shape.data,
				// Field-level input errors for forms: { formErrors, fieldErrors }.
				zodError:
					error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
				conflict: causeField(error.cause, 'conflict'),
				conflicts: causeField(error.cause, 'conflicts'),
			},
		};
	},
});

export const createTRPCRouter = t.router;

/**
 * Public procedure - no authentication required
 * Use this for endpoints that anyone can access
 */
export const publicProcedure = t.procedure;

/**
 * Signed-in callers only. UNAUTHORIZED without a session; FORBIDDEN when the
 * session's user is banned (the ban flag rides along in the session, so this
 * costs no query). `ctx.user` is non-null after this middleware.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message: 'You must be logged in to access this resource',
		});
	}
	if (isBanActive(ctx.user)) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'This account is suspended',
		});
	}
	return next({
		ctx: { ...ctx, session: ctx.session, user: ctx.user },
	});
});

/**
 * Admins only. Re-reads role and ban status from D1 on every call instead of
 * trusting the (up to 5 minutes old) session, so revoking a role or banning
 * an admin takes effect immediately. FORBIDDEN otherwise.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!(await isActiveAdmin(ctx.db, ctx.user.id))) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'You must be an admin to access this resource',
		});
	}
	return next();
});

/**
 * Per-procedure rate limit with a Cloudflare Rate Limiting binding, keyed by
 * user id when signed in, else by IP. Over the limit: TOO_MANY_REQUESTS (429)
 * and one "rate-limited" line in Workers Logs (src/lib/rate-limit.ts).
 */
export const rateLimit = (limiter: RateLimiterName, scope: string) =>
	t.middleware(async ({ ctx, next }) => {
		const ip = clientIp(ctx.headers);
		const key = actorKey(scope, { userId: ctx.user?.id, ip });
		if (await isRateLimited(ctx.env, limiter, key, { path: scope, ip })) {
			throw new TRPCError({
				code: 'TOO_MANY_REQUESTS',
				message: 'Too many requests. Please wait a minute and try again.',
			});
		}
		return next();
	});
