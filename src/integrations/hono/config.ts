import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '../trpc/router'
import type { TRPCContext } from '../trpc/init'
import { auth } from '@/lib/auth'

type Bindings = {
  DB: D1Database
  KV_SESSIONS: KVNamespace
  BETTER_AUTH_SECRET: string
  RESEND_API_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  BETTER_AUTH_URL: string
}

export const createHonoApp = () => {
  const app = new Hono<{ Bindings: Bindings }>()

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? ['https://www.irishette.com']
          : ['http://localhost:3000'],
      credentials: true,
    }),
  )

  // Better Auth integration using Hono
  app.on(['POST', 'GET'], '/api/auth/**', async (c) => {
    const authInstance = auth(c.env)
    return authInstance.handler(c.req.raw)
  })

  // tRPC integration
  app.use('/api/trpc/*', async (c) => {
    return fetchRequestHandler({
      endpoint: '/api/trpc',
      req: c.req.raw,
      router: trpcRouter,
      createContext: (): TRPCContext => ({
        db: c.env.DB,
        kv: c.env.KV_SESSIONS,
      }),
    })
  })

  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  return app
}
