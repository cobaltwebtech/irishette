import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { TRPCRouter } from './router';

/**
 * React bindings for tRPC + TanStack Query. The provider is mounted in
 * src/router.tsx with the per-router QueryClient and tRPC client.
 *
 * Components: `const trpc = useTRPC()`, then
 * `useSuspenseQuery(trpc.rooms.list.queryOptions())` /
 * `useMutation(trpc.rooms.update.mutationOptions())`.
 * Loaders: use `context.trpc` and `context.queryClient` instead.
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<TRPCRouter>();
