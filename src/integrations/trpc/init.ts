import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { auth } from '@/lib/auth';

// Define the session type from Better Auth
type Session = Awaited<
	ReturnType<Awaited<ReturnType<typeof auth>>['api']['getSession']>
>;

export type TRPCContext = {
	db: D1Database;
	env: {
		STRIPE_SECRET_KEY: string;
		STRIPE_PUBLISHABLE_KEY: string;
		STRIPE_TRPC_WEBHOOK_SECRET: string;
		BETTER_AUTH_URL: string;
		RESEND_API_KEY: string;
	};
	// Session can be null for unauthenticated requests
	session: Session | null;
	// Request headers for any additional auth needs
	headers: Headers;
};

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
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
	if (!ctx.session?.user) {
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
			user: ctx.session.user,
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
