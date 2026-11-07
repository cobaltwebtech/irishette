import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { createTRPCClient, httpBatchLink, localLink } from '@trpc/client';
import superjson from 'superjson';
import { createTRPCContext } from './context';
import { type TRPCRouter, trpcRouter } from './router';

/**
 * One tRPC client per router instance (getRouter() runs once per SSR request
 * and once in the browser).
 *
 * - Server (SSR): calls procedures in-process with localLink. No HTTP
 *   self-fetch, and the incoming request's cookies authenticate the call.
 *   The context is built once per request and shared by all SSR calls.
 * - Browser: batches calls to /api/trpc.
 *
 * The Start compiler strips the `.server()` branch (and its server-only
 * imports) from the client bundle; `pnpm check:bundle` guards against leaks.
 */
export const makeTRPCClient = createIsomorphicFn()
	.server(() => {
		let context: ReturnType<typeof createTRPCContext> | undefined;
		return createTRPCClient<TRPCRouter>({
			links: [
				localLink({
					router: trpcRouter,
					transformer: superjson,
					createContext: () => {
						context ??= createTRPCContext({
							headers: new Headers(getRequestHeaders()),
						});
						return context;
					},
				}),
			],
		});
	})
	.client(() =>
		createTRPCClient<TRPCRouter>({
			links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
		}),
	);
