# Authentication and sessions

Auth is Better Auth (`src/lib/auth.ts`) on D1 through the Drizzle adapter,
mounted at `/api/auth/*` (`src/routes/api/auth.$.ts`, all HTTP methods). The
page reads the session through one server function that returns a small,
token-free user shape. Route guards are only for UX: tRPC procedures enforce
auth on the server.

| Piece | Code |
|---|---|
| Server config | `src/lib/auth.ts` (`auth()`, `createAuth`) |
| Browser client | `src/lib/auth-client.ts` (`authClient`) |
| Auth emails | `src/lib/email-service.ts` (`sendPasswordResetEmail`, `sendMagicLinkEmail`, `sendVerificationEmail`, `sendChangeEmailConfirmation`) |
| Session for the page | `src/core/functions/auth-server.ts` (`getSessionFn`), `src/lib/session.ts` |
| Route guards | `src/routes/__root.tsx`, `src/routes/_authed.tsx`, `src/routes/_authed/_admin.tsx`, `src/lib/redirect.ts` |
| tRPC auth | `src/integrations/trpc/context.ts`, `inner-context.ts`, `init.ts` |
| Auth pages | `src/routes/auth/` (login, signup, forgot-password, reset-password, logout) |
| Form validation | `src/lib/auth-validation.ts` |
| Tables | `src/db/auth-schema.ts` |

## Server config (`src/lib/auth.ts`)

`auth()` builds the instance once per isolate (Better Auth validates its schema
on creation) and reads secrets and the D1 binding from `cloudflare:workers`.

| Setting | Value |
|---|---|
| Session lifetime | 7 days (`expiresIn`), extended when older than 24 h (`updateAge`) |
| Cookie cache | On, 5 minutes. `getSession` trusts the signed cookie for that long without reading D1 |
| Ids | `advanced.database.generateId` = `newId()` (UUIDv7, `src/lib/ids.ts`) for every Better Auth table |
| `user.publicId` | Additional field, `input: false`, default `newPublicId()` (16 chars `[0-9a-z]`). Used in URLs (`/admin/guest/$publicId`) instead of the id |
| Rate limiting | `rateLimit.enabled: true`, default rules and storage (in memory, so per isolate) |
| Client IP | `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']` |
| Email + password | Enabled, `requireEmailVerification: true` |
| Email verification | `sendOnSignUp`, `autoSignInAfterVerification` |
| Change email | `user.changeEmail.enabled`, with `sendChangeEmailConfirmation` |

Plugins, in order (`tanstackStartCookies()` must stay last):

| Plugin | What it does here |
|---|---|
| `admin()` | `user.role` (`'user'` by default, `'admin'`), ban fields, `/admin/*` auth endpoints. Promote locally with `pnpm db:make-admin:local` |
| `magicLink()` | Passwordless sign-in and sign-up. Creates the user if new (with `emailVerified: true`) and marks an existing unverified user as verified |
| `phoneNumber()` | `user.phoneNumber` (unique) and `phoneNumberVerified`. No `sendOTP` is configured, so OTP flows are not used; the number is edited through tRPC (see [Profile editing](#profile-editing)) |
| `stripe()` | `createCustomerOnSignUp`: a database hook creates a Stripe customer whenever a user row is created (any sign-up method) and stores `user.stripeCustomerId`. Its webhook is verified with `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` |
| `captcha()` | Cloudflare Turnstile, verified server-side with `TURNSTILE_SECRET_KEY`, on `/sign-in/magic-link`, `/sign-up/email`, `/sign-in/email`, `/request-password-reset`. The client sends the token in the `x-captcha-response` header |
| `tanstackStartCookies()` | Writes Better Auth's `Set-Cookie` headers from server functions |

### Emails

All four hooks call `src/lib/email-service.ts`, which sends through Resend
(`FROM_AUTH`) and **throws** on delivery failure, so Better Auth reports an
error instead of claiming the email was sent.

| Flow | Trigger | Sent to |
|---|---|---|
| Verify email | Password sign-up (`sendOnSignUp`) | New address. Clicking verifies and signs in |
| Magic link | `signIn.magicLink` | The address entered |
| Password reset | `requestPasswordReset` | The account address; link lands on `/auth/reset-password?token=` |
| Change email (verified user) | `changeEmail` | Current address (`sendChangeEmailConfirmation`); after approval the new address is verified too |
| Change email (unverified user) | `changeEmail` | New address (verification email) |

A password sign-in by an unverified user fails with `EMAIL_NOT_VERIFIED`
(`sendOnSignIn` is not set, so no new email is sent). Signing in with a magic
link verifies the address.

## Client

`src/lib/auth-client.ts` creates `authClient` with `magicLinkClient`,
`phoneNumberClient`, `adminClient` and `stripeClient`, no `baseURL` (current
origin) and `credentials: 'include'`. It re-exports `signIn`, `signOut`,
`signUp`, `revokeSessions`, `requestPasswordReset`, `resetPassword`,
`sendVerificationEmail`, `changeEmail` and `$Infer`. Its calls return
`{ data, error }`; they do not throw on an API error.

Do not use Better Auth's own `useSession` hook; use `src/lib/session.ts`.

| Route | Guard (`beforeLoad`) | Does |
|---|---|---|
| `/auth/login` | `redirectIfSignedIn(session, search.redirect)` | Magic link (default) or email + password. Password success: `refreshSession`, then `router.history.push(redirect ?? '/account')`. Shows Better Auth `?error=` codes (also when nested in `redirect`) |
| `/auth/signup` | `redirectIfSignedIn` | Magic link (default) or name + email + password (`registerSchema`), then "check your email" |
| `/auth/forgot-password` | `redirectIfSignedIn` | `requestPasswordReset({ redirectTo: '/auth/reset-password' })` |
| `/auth/reset-password` | `redirectIfSignedIn(session, undefined)` | Reads `token`/`error` from the URL, checks `passwordSchema`, calls `resetPassword` |
| `/auth/logout` | none | In an effect (never in `beforeLoad`, which also runs during SSR and preload): `signOut()`, `clearSession`, navigate to `/` |

The header's logout button (`src/components/Header.tsx`) does the same as
`/auth/logout`. The booking flow's `AuthenticationStep` sends a magic link back
to `/booking`.

**Turnstile.** Every form that hits a captcha endpoint renders
`<Turnstile siteKey={import.meta.env.VITE_TURNSTILE_PUBLIC_KEY}>`
(`@marsidev/react-turnstile`), keeps the token in state, disables submit until
it exists, and passes it as `x-captcha-response`. On error or expiry the token
is cleared and the widget reset. The secret never reaches the client.

**Redirects** (`src/lib/redirect.ts`). `redirectSearchParam` is a Zod schema
for `?redirect=`: only same-origin paths survive (single leading `/`, no `//`,
backslashes or control characters); anything else becomes `undefined` and the
default `DEFAULT_AUTH_REDIRECT` (`/account`) applies. Every auth page validates
`redirect` with it. Better Auth also origin-checks `callbackURL`.

**Validation** (`src/lib/auth-validation.ts`). `passwordSchema` (8 to 100
chars, upper, lower, digit), `emailSchema`, `registerSchema` (email, password
of 8+ chars, confirmation, optional name). Better Auth enforces its own
minimum length on the server.

## Session on the page

### `getSessionFn` and the session shape

`getSessionFn` (`src/core/functions/auth-server.ts`) is a GET server function
(`createServerFn(...).validator(z.object({ fresh }).optional())`). It calls
`auth.api.getSession` with the request headers and returns `AppSession`:
`{ user: SessionUser } | null`, where `SessionUser` is `id`, `publicId`, `name`,
`email`, `image`, `role`, `emailVerified`, `phoneNumber`, `createdAt`.

This is the **only** session shape that leaves the server. It is dehydrated
into the SSR HTML, so never add the session token, IP address, user agent or
other session fields to it. `fresh: true` passes `disableCookieCache` and reads
the session from D1.

### `src/lib/session.ts`

| Export | Use |
|---|---|
| `sessionQueryOptions()` | Query `['auth', 'session']`, `getSessionFn()`, `staleTime` 60 s |
| `freshSessionQueryOptions()` | Same key, `getSessionFn({ data: { fresh: true } })`, `staleTime` 5 s |
| `useSession()` | `useSuspenseQuery(sessionQueryOptions()).data`; always resolved because the root preloads it |
| `refreshSession(queryClient, router)` | Fetches the fresh session (bypassing the 5-minute cookie cache), then `router.invalidate()` to re-run guards and loaders |
| `clearSession(queryClient, router)` | Sets the session to `null`, removes every other cached query (it may hold the previous user's data), then `refreshSession` |

### Guards

- **Root** (`src/routes/__root.tsx`): `beforeLoad` runs
  `queryClient.ensureQueryData({ ...sessionQueryOptions(), revalidateIfStale: true })`
  and returns `{ session }` into the router context. On SSR this happens once
  per request and the result is dehydrated; client navigations read the cache
  and revalidate in the background when stale. A failed lookup is logged and
  treated as signed out.
- **`/_authed`** (`src/routes/_authed.tsx`): pathless layout for `/account/*`,
  `/booking/confirmation/*` and the admin pages. No session: redirect to
  `/auth/login?redirect=<location.href>`. Otherwise it returns `{ user }`, which
  pages read with `Route.useRouteContext()`.
- **`/_authed/_admin`** (`src/routes/_authed/_admin.tsx`): fetches
  `freshSessionQueryOptions()` so a revoked role takes effect quickly. No
  session: login redirect. Not an admin: redirect to `/` (sending a signed-in
  user to login would bounce back, a redirect loop).

## tRPC

`createTRPCContext({ headers })` (`context.ts`) calls `auth.api.getSession` (with
the cookie cache) and passes the result to `createInnerTRPCContext`
(`inner-context.ts`), which adds `db`, `env`, `stripe`, `waitUntil`, `session`,
`user` and `headers`. The HTTP handler (`src/routes/api/trpc.$.ts`) builds it
per request; during SSR the `localLink` client (`client.ts`) builds it once per
request from the incoming cookies. `ctx.session` is server-only and is never
returned to clients.

`init.ts`: `publicProcedure`; `protectedProcedure` throws `UNAUTHORIZED` without
a session and narrows `ctx.user`; `adminProcedure` extends it and throws
`FORBIDDEN` unless `ctx.user.role === 'admin'`. Ownership checks (a user's own
bookings) live in each procedure. See the tRPC docs for details.

## After an auth action

| Action | Call |
|---|---|
| Password sign-in | `refreshSession(queryClient, router)`, then navigate |
| Magic link / email verification | Nothing: the link is a full page load, and the root reloads the session |
| Sign-out | `signOut()`, then `clearSession(queryClient, router)`, then navigate |
| Profile change (name, phone) | `refreshSession(queryClient, router)` |
| Email change | Nothing until the user confirms by email |

## Profile editing

`EditProfileModal` (`src/components/EditProfileModal.tsx`), opened from the
account page (`src/routes/_authed/account/index.tsx`):

- Name and phone: `users.updateProfile` (`src/integrations/trpc/users.ts`,
  `protectedProcedure`). Optional `name` (trimmed, 1 to 100) and `phoneNumber`
  (trimmed, 10 to 20 chars); updates only `ctx.user.id`. A duplicate phone
  number (unique column) returns `CONFLICT`. Then `refreshSession`.
- Email: never through tRPC. The modal calls `changeEmail({ newEmail,
  callbackURL: '/account' })`; the address changes only after the emailed
  confirmation.

The booking details step (`src/components/booking/BookingDetailsStep.tsx`)
also saves the guest's profile: the name with `authClient.updateUser`, the
phone with `users.updatePhoneNumber` (`protectedProcedure`, min 10 chars),
then `refreshSession`. Failures there are logged and do not block the booking.

Admins read users through `users.adminListGuests` and
`users.adminGetGuestDetails` (`adminProcedure`, by `publicId`).

## Rules

- Never send the session token (or IP, user agent) to the client. Only
  `getSessionFn` returns session data to the page, and only `SessionUser`.
- Check roles on the server: `adminProcedure` for tRPC; `_admin` is UX.
- New pages that need a user go under `src/routes/_authed/`; admin pages under
  `_authed/_admin/`.
- Read the session with `useSession()` or the `_authed` route context, never
  by calling `auth` or `getSession` from components.
- After changing anything in the session user, call `refreshSession`; after
  sign-out, `clearSession`.
- Sanitize every redirect target with `redirectSearchParam`.
- Keep the Turnstile header on every captcha endpoint call, and keep
  `tanstackStartCookies()` last in the plugin list.

## Tests

| Test | Covers |
|---|---|
| `test/workers/trpc-authz.test.ts` | Sweeps every procedure: anything not in `PUBLIC` rejects anonymous callers with `UNAUTHORIZED`; anything not in `PUBLIC` or `USER` rejects normal users with `FORBIDDEN` |
| `test/workers/helpers.ts` | `makeCtx(role)` builds a context with a synthetic session via `createInnerTRPCContext` (no Better Auth) |
| `test/unit/validation.test.ts` | `redirectSearchParam` keeps same-origin paths and drops unsafe values |
| `e2e/public.spec.ts` | `/admin` and `/account` send a signed-out visitor to `/auth/login?redirect=<path>` |
| `e2e/signed-in.spec.ts` | Password login reaches `/account` and survives a hard reload; a non-admin on `/admin` lands on `/` (no loop); hard reload of an own booking page and of admin pages. Needs `E2E_USER_*` / `E2E_ADMIN_*` credentials, otherwise skipped |

The e2e `login` helper (`e2e/fixtures.ts`) waits for Turnstile before
submitting.
