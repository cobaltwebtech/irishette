import { betterAuth } from 'better-auth'
import { magicLink, admin } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import { stripe } from '@better-auth/stripe'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { MagicLinkEmail } from '@/components/email/MagicLinkEmail'
import * as authSchema from '@/db/auth-schema'

// Define the Env interface
interface Env {
  DB: D1Database
  KV_SESSIONS: KVNamespace
  BETTER_AUTH_SECRET: string
  RESEND_API_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  BETTER_AUTH_URL: string
}

// Initialize Drizzle with the Cloudflare D1 database
export const createDrizzle = (db: D1Database) =>
  drizzle(db, { schema: authSchema })

export const auth = (env: Env) => {
  // Initialize Stripe with environment variables from runtime
  const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-07-30.basil',
  })

  // Initialize Resend for email service with runtime env
  const resend = new Resend(env.RESEND_API_KEY)

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDrizzle(env.DB), {
      provider: 'sqlite',
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 7, // Session expires in 7 days
      updateAge: 60 * 60 * 24, // Every 24 hours the session expiration is updated
    },
    rateLimit: {
      enabled: true,
    },
    advanced: {
      ipAddress: {
        // Cloudflare specific header for rate limiting
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    plugins: [
      admin(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          try {
            console.log('Attempting to send magic link email to:', email)
            await resend.emails.send({
              from: 'Irishette <auth@notify.irishette.com>',
              to: email,
              subject: 'Login to Irishette',
              react: await MagicLinkEmail({
                url: url,
              }),
            })
            console.log('Magic link email sent successfully')
          } catch (error) {
            console.error('Error sending magic link email:', error)
            throw error
          }
        },
      }),
      stripe({
        stripeClient,
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
        createCustomerOnSignUp: true,
      }),
    ],
  })
}

export type Auth = ReturnType<typeof auth>
