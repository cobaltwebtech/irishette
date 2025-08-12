import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

export type TRPCContext = {
  db: D1Database
  kv: KVNamespace
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure
