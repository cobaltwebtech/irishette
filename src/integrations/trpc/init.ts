import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

export type TRPCContext = {
	db: D1Database;
	kv: KVNamespace;
	env: {
		STRIPE_SECRET_KEY: string;
		STRIPE_TRPC_WEBHOOK_SECRET: string;
		BETTER_AUTH_URL: string;
		RESEND_API_KEY: string;
	};
};

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
