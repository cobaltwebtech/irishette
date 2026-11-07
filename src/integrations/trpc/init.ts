import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError, z } from 'zod';
import type { TRPCContext } from './context';

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
		return {
			...shape,
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
 * Protected procedure - requires authentication
 * Throws UNAUTHORIZED error if user is not logged in
 * Use this for endpoints that require a logged-in user
 *
 * @example
 * getMyBookings: protectedProcedure
 *   .query(async ({ ctx }) => {
 *     // ctx.user is guaranteed to exist here
 *     const userId = ctx.user.id;
 *     // ...
 *   })
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	// Check if session exists and has a user
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message: 'You must be logged in to access this resource',
		});
	}

	// Pass through with narrowed session type
	return next({
		ctx: {
			...ctx,
			// Now TypeScript knows session and user are non-nullable
			session: ctx.session,
			user: ctx.user,
		},
	});
});

/**
 * Admin procedure - requires authentication AND admin role
 * Throws UNAUTHORIZED if not logged in
 * Throws FORBIDDEN if not an admin
 * Use this for admin-only endpoints
 *
 * @example
 * adminListAllBookings: adminProcedure
 *   .query(async ({ ctx }) => {
 *     // ctx.user is guaranteed to exist AND have admin role
 *     // ...
 *   })
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	// At this point, we know user exists (from protectedProcedure)
	// Now check if they have admin role
	if (ctx.user.role !== 'admin') {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'You must be an admin to access this resource',
		});
	}

	return next();
});
