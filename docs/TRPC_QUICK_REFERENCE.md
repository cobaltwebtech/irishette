# tRPC API

The app's data API is one tRPC v11 router, `trpcRouter`
(`src/integrations/trpc/router.ts`). Browsers call it over HTTP at
`/api/trpc`; SSR calls it in-process. Auth (Better Auth), the Stripe webhook
and the iCal export feed are separate HTTP routes (see
[Other HTTP endpoints](#other-http-endpoints)).

## Files

| File | What |
|---|---|
| `src/integrations/trpc/init.ts` | `initTRPC` with the superjson transformer and `errorFormatter`; exports `createTRPCRouter`, `publicProcedure`, `protectedProcedure`, `adminProcedure` |
| `src/integrations/trpc/context.ts` | `createTRPCContext({ headers })`: resolves the Better Auth session from the request headers, then calls `createInnerTRPCContext` |
| `src/integrations/trpc/inner-context.ts` | `createInnerTRPCContext({ session, headers?, waitUntil? })` and the `TRPCContext` / `AuthSession` types. Tests call it directly with a synthetic session |
| `src/integrations/trpc/router.ts` | `trpcRouter` (`rooms`, `bookings`, `availability`, `ical`, `policies`, `users`, `inbox`) and the `TRPCRouter` type |
| `src/integrations/trpc/{rooms,bookings,availability,ical,policies,users,inbox}.ts` | The routers |
| `src/integrations/trpc/client.ts` | `makeTRPCClient`: `localLink` on the server, `httpBatchLink` in the browser |
| `src/integrations/trpc/react.ts` | `TRPCProvider` and `useTRPC` (`@trpc/tanstack-react-query`) |
| `src/integrations/trpc/batching.ts` | `MAX_BATCH_SIZE = 20`, shared by the client link (`maxItems`) and the handler (`maxBatchSize`) |
| `src/integrations/trpc/errors.ts` | `orNotFound(promise)`: turns a tRPC `NOT_FOUND` into the router's `notFound()` in loaders |
| `src/integrations/trpc/types.ts` | `RouterOutputs` (e.g. `RouterOutputs['bookings']['getMyBookings']`) |
| `src/routes/api/trpc.$.ts` | HTTP handler (`fetchRequestHandler`) for `GET`/`POST /api/trpc/*` |
| `src/router.tsx` | `getRouter`: per-request `QueryClient`, tRPC client, options proxy and provider |
| `src/lib/deps.ts` | `ServiceDeps` / `createServiceDeps`: the `db`, `env`, `stripe`, `waitUntil` part of the context |
| `src/lib/*-validation.ts` | Zod input schemas (`payment-validation.ts`, `room-validation.ts`, `inbox-validation.ts`, ...) |

## Request flow

| Caller | Link | Context |
|---|---|---|
| Browser | `httpBatchLink` to `/api/trpc`, superjson, `methodOverride: 'POST'` (queries send their input in the body), at most `MAX_BATCH_SIZE` calls per request | `createTRPCContext({ headers: request.headers })` per HTTP request (`src/routes/api/trpc.$.ts`) |
| SSR (loaders, `useSuspenseQuery` during render) | `localLink` with `trpcRouter`, superjson; no HTTP self-fetch | `createTRPCContext` with the incoming request's headers, built lazily once per request and shared by all SSR calls |

`makeTRPCClient` is a `createIsomorphicFn`; the Start compiler strips the
`.server()` branch (and `context.ts`, `router.ts`) from the client bundle.
`pnpm check:bundle` guards against secret names leaking into client assets.

The HTTP handler sets `allowMethodOverride: true` and `maxBatchSize`, and its
`onError` logs only `INTERNAL_SERVER_ERROR`s, with the procedure path and the
error (no input or user data).

### Per-request state

`getRouter` (`src/router.tsx`) runs once per SSR request and once in the
browser. It creates, never at module scope:

- a `QueryClient` (`staleTime: 60_000`, `retry: 1`, `refetchOnWindowFocus: false`);
- the tRPC client (`makeTRPCClient()`);
- `trpc = createTRPCOptionsProxy({ client, queryClient })`.

These go into the router context as `{ queryClient, trpc, trpcClient }`
(typed in `src/routes/__root.tsx`). `Wrap` mounts `TRPCProvider` with the same
clients, and `setupRouterSsrQueryIntegration` provides the
`QueryClientProvider` and dehydrates the SSR cache into the page. Because the
cache is per request, one user's data cannot be dehydrated into another
user's page.

### Context

`createInnerTRPCContext` returns:

| Field | Source |
|---|---|
| `db` | Drizzle over `env.DB` (`createServiceDeps`) |
| `env` | `cloudflare:workers` bindings |
| `stripe` | Stripe client from `env.STRIPE_SECRET_KEY` |
| `waitUntil` | Worker `waitUntil` (tests pass their own) |
| `session` | Better Auth session, or `null`. Server-side only; never returned |
| `user` | `session?.user ?? null` (includes `role`) |
| `headers` | Request headers |

The context satisfies `ServiceDeps`, so procedures pass `ctx` straight to
services in `src/lib/` (`booking-service.ts`, `ical-sync.ts`). The Stripe
webhook and cron handlers build the same deps with `createServiceDeps`.

`createTRPCContext` calls `auth().api.getSession({ headers })`, which honours
Better Auth's 5-minute session cookie cache (`src/lib/auth.ts`).

## Procedures and middleware

| Builder | Check | Failure |
|---|---|---|
| `publicProcedure` | none | |
| `protectedProcedure` | `ctx.session` and `ctx.user` set (narrows both to non-null); the session user is not banned (`isBanActive`, no query) | `UNAUTHORIZED` (anonymous), `FORBIDDEN` (banned) |
| `adminProcedure` | `protectedProcedure`, then `isActiveAdmin` re-reads `role`, `banned` and `banExpires` from D1 (one primary-key lookup) | `UNAUTHORIZED`, `FORBIDDEN` (not an unbanned admin in D1) |

`rateLimit(limiter, scope)` (`init.ts`) is a middleware for individual
procedures: it counts the call against a Cloudflare Rate Limiting binding
(`src/lib/rate-limit.ts`), keyed by user id when signed in, else by IP, and
throws `TOO_MANY_REQUESTS` over the limit. Used on `bookings.calculateBooking`,
`rooms.calculatePricing` and `ical.testUrl` (`API_RATE_LIMITER`, 60 per minute
per key). The access checks live in `src/integrations/trpc/access.ts`.

## Errors

`errorFormatter` in `init.ts`:

- `INTERNAL_SERVER_ERROR` messages are replaced with
  `Something went wrong. Please try again.` Unexpected errors (plain `Error`,
  SQL, Stripe) become this code, so their messages never reach the client.
  Any custom message on an `INTERNAL_SERVER_ERROR` is also hidden.
- `data.zodError`: `z.flattenError(cause)` (`{ formErrors, fieldErrors }`) for
  input validation failures, else `null`.
- `data.conflict` / `data.conflicts`: copied from a plain-object `cause`
  (`throw new TRPCError({ code: 'CONFLICT', cause: { conflicts } })`), else
  `null`.

Code conventions used by the routers and `src/lib/booking-service.ts`:

| Code | Used for |
|---|---|
| `UNAUTHORIZED` | Not signed in (middleware) |
| `FORBIDDEN` | Signed in but banned, or not an admin (middleware). The only auth codes: the browser refreshes the session on either (below) |
| `TOO_MANY_REQUESTS` | Over a `rateLimit` binding limit |
| `BAD_GATEWAY` | An external provider failed and the client should see why (`resendConfirmationEmail` when Resend fails) |
| `NOT_FOUND` | Missing row, **and** a booking that exists but belongs to someone else (no existence leak) |
| `BAD_REQUEST` | Zod input errors; business rules (past dates, guest count over `maxGuests`, inactive room, end before start, resend for a non-confirmed booking) |
| `CONFLICT` | Dates taken (`createBooking` sends `cause.conflicts` with dates only), payment confirmed after the dates were taken (refunded), overlapping pricing rule (`cause.conflict`), block over reservations or another block (`cause.conflicts`), unique violations (room slug, feed URL, phone number), stale booking state |
| `PRECONDITION_FAILED` | Refund requested for a booking without a Stripe payment |
| `INTERNAL_SERVER_ERROR` | Anything unexpected (logged once by `onError`, message hidden). Procedures do not catch and re-log errors themselves |

Client helpers: `orNotFound` (loaders), `isAuthError` (`UNAUTHORIZED` or
`FORBIDDEN`), `isTRPCClientError<TRPCRouter>(error)`
and `error.data?.zodError` / `error.data?.conflict(s)` in forms
(`src/routes/_authed/_admin/admin/cancellation-policy.tsx`,
`src/components/admin/RoomPricingRules.tsx`,
`src/components/admin/RoomBlockingManagement.tsx`).

## Procedure reference

Access: **public** = `publicProcedure`, **user** = `protectedProcedure`,
**admin** = `adminProcedure`. "Owner or admin" means `protectedProcedure` plus
an ownership check in the procedure. Schemas without a file are inline.

### `rooms` (`src/integrations/trpc/rooms.ts`)

Room outputs use `publicRoomColumns` (never `icalExportToken`).

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `list` | query | public | `getRoomsSchema` (`limit` 1-100, default 10; `offset`) | **Active** rooms ordered by name, with `pagination` (`total`, `hasMore`) |
| `get` | query | public | `getRoomSchema` (one of `{ id }`, `{ publicId }`, `{ slug }`) | One **active** room. `NOT_FOUND` if missing or not active |
| `adminList` | query | admin | `adminGetRoomsSchema` (`getRoomsSchema` + optional `status`) | Every room (any status); admin sidebar, dashboard and property list |
| `adminGet` | query | admin | `getRoomSchema` | One room, any status (room editor) |
| `calculatePricing` | query | public, rate-limited | `calculatePricingSchema` (`roomId`, `checkInDate`, `checkOutDate`; `guestCount` ignored) | Base price per night with applied pricing rules (calendar). Uses `quoteStay` |
| `create` | mutation | admin | `createRoomSchema` | Create a room; `isActive` follows `status`. `CONFLICT` on duplicate slug |
| `update` | mutation | admin | `updateRoomSchema` (partial + `id`) | Update a room. `NOT_FOUND`, `CONFLICT` on duplicate slug |
| `getPricingRules` | query | admin | `getPricingRulesSchema` (`roomId`, optional `isActive`, date range) | A room's pricing rules overlapping the range |
| `createPricingRule` | mutation | admin | `createPricingRuleSchema` | Insert a rule; an active rule may not overlap another active rule (checked in the same SQL statement). End date may not be in the past |
| `updatePricingRule` | mutation | admin | `updatePricingRuleSchema` (partial + `id`) | Update a rule; re-checks overlap when the result is active |
| `deletePricingRule` | mutation | admin | `deletePricingRuleSchema` (`id`) | Delete a rule; returns `deletedRule` |
| `getBlockedPeriods` | query | admin | `getBlockedPeriodsSchema` (optional `roomId`, date range; `limit` default 50, `offset`) | Admin blocks overlapping the range |
| `createBlockedPeriod` | mutation | admin | `createBlockedPeriodSchema` | Block dates (inclusive). `CONFLICT` with `data.conflicts` if it covers a confirmed booking, live hold, imported event or another block |
| `updateBlockedPeriod` | mutation | admin | `updateBlockedPeriodSchema` (partial + `id`) | Update a block; re-checks conflicts when dates change |
| `deleteBlockedPeriod` | mutation | admin | `deleteBlockedPeriodSchema` (`id`) | Delete a block |

### `bookings` (`src/integrations/trpc/bookings.ts`)

Schemas are in `src/lib/payment-validation.ts`. Owner checks go through
`findAccessibleBooking`, which returns `NOT_FOUND` for other users' bookings.

Guest responses (`getBooking`, `getMyBookings`) select `GUEST_BOOKING_FIELDS`:
`publicId`, `confirmationId`, `status`, `paymentStatus`, the dates and their
instants (`checkInAt`, `checkOutAt`), nights, guests, the amounts
(`baseAmount`, `feesAmount`, `taxAmount`, `totalAmount`, `refundAmount`), the
guest's own name/email/phone/special requests, `createdAt`, `cancelledAt`, and
the room's `name` and `slug`; plus the derived `stayPhase`
(`upcoming` / `in_stay` / `past`, property time), `canCancel` (false from
check-in on, and while the payment has an open dispute) and `cancelUntil`
(check-in, 4:00 PM CT). **Guests never get dispute information** (decision
2026-11-08): no dispute fields, and blocked cancellations are not explained. `getBooking` also returns the booking's
`cancellationPolicy` (`name`, `tiers`). Never the
internal `id`, `userId`, `roomId`, `internalNotes`, Stripe ids,
`cancellationPolicyId` or the payment transaction. Admin pages use
`adminGetBooking`.

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `calculateBooking` | query | public, rate-limited | `calculateBookingSchema` (`roomId`, dates, `guestCount`) | Full price (base, fees, taxes, nights, applied rules, tax breakdown). Same `quoteStay` and date limits (`assertBookableDates`: same-day cutoff 9:00 AM CT, 30 nights, 10 months) as booking creation |
| `createBooking` | mutation | user | `createBookingSchema` (room, dates, guest count/name/email/phone, special requests; client prices ignored) | `createHold`: 35-minute pending hold (releases expired holds on the dates first: priority rule); returns `bookingId`, `publicId` |
| `createCheckoutSession` | mutation | user (owner) | `bookingIdSchema` | `prepareCheckout`: the hold's Checkout Session (`ui_mode: 'elements'`). Returns `{ status: 'open', clientSecret }` or `{ status: 'complete' }` (already paid / processing), plus `publicId`, `publishableKey` |
| `refreshBooking` | mutation | user (owner) | `bookingIdSchema` | `refreshHold`: extend an expired hold if the dates are still free |
| `confirmCheckout` | mutation | user (owner) | `confirmCheckoutSchema` (`publicId`, `sessionId` `cs_test_...`/`cs_live_...`) | Return-page fast path: `confirmBookingPayment` (idempotent; the webhook is the source of truth). Returns `{ status: 'confirmed' \| 'already_confirmed' \| 'processing' \| 'refunded_conflict', publicId }` |
| `getBooking` | query | user (owner only) | `bookingPublicIdSchema` | `{ booking, room }` with guest fields only (above) |
| `adminGetBooking` | query | admin | `bookingPublicIdSchema` | Any booking: the full row, the room (`bookingRoomColumns`), the guest account (`publicId`, `email`, `name`) and its payment `disputes` (panel fields, no internal ids) |
| `getMyBookings` | query | user | `{ limit 1-100 (10), offset, status? (pending/confirmed/cancelled), phase? ('upcoming' \| 'current' \| 'past', by `check_in_at`/`check_out_at`) }` | The caller's bookings (guest fields + `stayPhase`, `canCancel`, `cancelUntil`) with room name and slug, by check-in |
| `getCancellationQuote` | query | owner or admin | `bookingPublicIdSchema` | Whether the booking can be cancelled now, the refund under its policy (`refundAmount`, `refundPercent`, `amountPaid`, `alreadyRefunded`, `refundableAmount`), `checkInDate`, `checkInAt`, every tier's cutoff as a UTC instant (`refundCutoffs: [{ refundPercent, minHoursBefore, until }]`), the policy (`name`, `tiers`), `cancelBlocked` (`'check_in_passed' \| 'contact_us' \| null`, for the guest message) and `hasOpenDispute` (**admins only**; always `false` for guests, who only get `canCancel: false` and `contact_us`) |
| `cancelBooking` | mutation | user (owner only) | `cancelBookingSchema` (`publicId`, `reason?`, `expectedRefundAmount?`) | Guest cancellation, refund per policy (saved first, then refunded). `CONFLICT` ("cannot be cancelled online, please contact us"; the dispute is not mentioned) while the payment has an open dispute, or when the refund differs from `expectedRefundAmount` (a window passed). Returns `refundAmount`, `refundPercent`, `refundFailed?` |
| `adminCancelBooking` | mutation | admin | `adminCancelBookingSchema` (`publicId`, `refund: 'full' \| 'policy' \| 'none'`, `reason?`, `confirmDisputeRefund?`, `expectedRefundAmount?`) | Admin cancellation with chosen refund (`full` = what is still paid). With an open dispute, a refund needs `confirmDisputeRefund: true` (else `CONFLICT`) |
| `resendConfirmationEmail` | mutation | owner or admin | `bookingPublicIdSchema` | Re-send the confirmation email; `BAD_REQUEST` unless confirmed, `BAD_GATEWAY` if Resend fails |
| `adminListBookings` | query | admin | `{ limit 1-100 (10), offset, status?, paymentStatus? (shared enums), phase?, roomId? (idSchema), startDate?, endDate? (isoDateSchema) }` | All bookings with room, guest (id, email, name), `hasOpenDispute` and `stayPhase`. `startDate` / `endDate` bound the check-in date and work alone or together |
| `adminUpdateInternalNotes` | mutation | admin | `{ bookingId, internalNotes (max 5000) }` | Set a booking's internal notes |
| `adminGetMonthlyStats` | query | admin | `{ months 1-24 (12), status: 'confirmed' \| 'all' }` | Booking count and revenue per check-in month |

### `availability` (`src/integrations/trpc/availability.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `getBySlug` | query | public | `{ roomSlug, startDate?, endDate?, monthsAhead 1-12 (10) }` (ISO dates) | Active room summary and unavailable date ranges (`loadUnavailability`) for the booking calendar, plus `today`, `earliestCheckIn` (same-day cutoff 9:00 AM CT), `lastCheckOut` and `maxNights`, all in property time. Dates only: no booking ids, confirmation ids or guest data |

### `ical` (`src/integrations/trpc/ical.ts`)

All admin. Feed URLs and the export URL (which contains the room's token) are
returned only here. See `ICAL_SYNC_README.md`.

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `listFeeds` | query | admin | `roomIdSchema` | A room's import feeds (including `url`), sync state and stored event count |
| `createFeed` | mutation | admin | `createIcalFeedSchema` (`roomId`, `source`, `label?`, public https `url`, `isActive`) | Add a feed. `CONFLICT` on duplicate URL for the room |
| `updateFeed` | mutation | admin | `updateIcalFeedSchema` (`id` + optional fields) | Update a feed; a new URL resets etag, last-modified, counts and error |
| `deleteFeed` | mutation | admin | `{ id }` | Delete a feed and its imported events |
| `testUrl` | mutation | admin, rate-limited | `testIcalUrlSchema` (`url`) | Fetch a URL with the sync's rules (`src/lib/ical-fetch.ts`: https only, no IP literals or localhost, also after redirects; 10 s timeout; 5 MB cap) and report whether it is an iCal feed and its event counts |
| `syncRoom` | mutation | admin | `roomIdSchema` + `force` (default `false`) | "Sync now" for all of a room's feeds (`syncRoomFeeds`) |
| `getSyncLogs` | query | admin | `{ roomId?, feedId? (idSchema), limit 1-100 (20) }` | Sync runs, newest first, with feed label |
| `getSyncChanges` | query | admin | `{ syncLogId }` | What one run changed, with the overlapping booking's `publicId` / `confirmationId` |
| `getExportUrl` | query | admin | `roomIdSchema` | `BETTER_AUTH_URL` + `/api/ical/<publicId>/<token>.ics` |
| `regenerateExportToken` | mutation | admin | `roomIdSchema` | New export token; returns the new URL (the old one stops working) |

`roomIdSchema`, `createIcalFeedSchema`, `updateIcalFeedSchema` and
`testIcalUrlSchema` are in `src/lib/room-validation.ts`. Feed URLs must pass
`isSafeFeedUrl` (`src/lib/ical-fetch.ts`).

### `policies` (`src/integrations/trpc/policies.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `getCancellationPolicy` | query | public | none | Active cancellation policy (name, tiers, `isDefault`), shown at checkout with each tier's cutoff in CT. Windows always count back from 4:00 PM CT (no per-policy time or zone) |
| `saveCancellationPolicy` | mutation | admin | `cancellationPolicyInputSchema` (`name`, `tiers`; `src/lib/cancellation-policy.ts`) | Save a new policy version for future bookings; existing bookings keep theirs |
| `listCancellationPolicies` | query | admin | none | All saved policy versions |

### `users` (`src/integrations/trpc/users.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `adminListGuests` | query | admin | `{ limit 1-100 (50), offset }` | Users with role `user`, with non-pending booking count, `total`, `hasMore` |
| `adminGetGuestDetails` | query | admin | `{ publicId }` (`publicIdSchema`) | The guest's profile (explicit columns: `publicId`, name, email, `emailVerified`, phone, role, `stripeCustomerId`, `createdAt`; no ban fields or internal id), their non-pending bookings (with `stayPhase`) and their payment `disputes` |
| `updateProfile` | mutation | user | `updateProfileSchema` (`src/lib/user-validation.ts`): `{ name? (trimmed, 1-100), phoneNumber? (phoneNumberSchema: trimmed, max 20 chars, at least 10 digits; null removes it) }` | Update the caller's own name and phone; omitted fields stay. The only way to change the phone (`additionalFields.phoneNumber` has `input: false` in Better Auth). `CONFLICT` if the phone is used by another account. Email changes go through Better Auth's `changeEmail` |

`users.updatePhoneNumber` was merged into `updateProfile` in plan 02 Phase 2
(listed in `REMOVED` in `trpc-authz.test.ts`). The booking input's
`guestPhone` uses the same `phoneNumberSchema`.

### `inbox` (`src/integrations/trpc/inbox.ts`)

The admin notification inbox (`ADMIN_INBOX.md`). All admin; items are
addressed by `publicId`. Schemas are in `src/lib/inbox-validation.ts`. List
rows carry no `details` JSON and no internal ids.

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `adminList` | query | admin | `inboxListSchema`: filters (`view`: `inbox` (new + read, default) \| `new` \| `read` \| `archived`; `source?`; `kind?`; `search?` max 100) + `pageSize` 1-100 (25), `cursor?`, `direction` `next` \| `prev` | One page, newest surfaced first, **keyset** on `(surfaced_at, public_id)`. Returns `items` (with the linked booking's confirmation id and the guest's name), `nextCursor` (older), `prevCursor` (newer). `search` is a `LIKE` on title and summary (`%`/`_` literal) |
| `adminCount` | query | admin | `inboxFiltersSchema` (the filters only) | `{ total }` for the filters; cached separately so paging does not recount |
| `adminUnreadCount` | query | admin | none | `{ unread }` (`status = 'new'`), for the sidebar badge |
| `adminGet` | query | admin | `{ publicId }` | One item with its `details` and linked booking / guest summaries. `NOT_FOUND` |
| `adminSetStatus` | mutation | admin | `inboxSetStatusSchema` (`publicIds` 1-100, `status`: `new` \| `read` \| `archived` \| `unarchived`) | Batch status change (`unarchived` = back to the inbox as read). Status is shared by all admins |
| `adminDelete` | mutation | admin | `inboxDeleteSchema` (`publicIds` 1-100) | Delete for good |
| `adminListForBooking` | query | admin | `{ bookingPublicId }` | The 20 latest items linked to a booking (admin booking page) |
| `adminListForUser` | query | admin | `{ userPublicId }` | The 20 latest items linked to a guest (admin guest page) |

The contact form is a TanStack Start server function, not a tRPC procedure
(`CONTACT_FORM.md`).

## Security model

- **Auth is enforced in procedures, not routes.** The `_authed` and
  `_authed/_admin` layouts (`src/routes/_authed.tsx`,
  `src/routes/_authed/_admin.tsx`, guards in `src/lib/auth-check.ts`) only
  redirect for UX. Every procedure behind them is `protectedProcedure` or
  `adminProcedure`. (TanStack Start server functions with private data use
  `requireSessionMiddleware` / `requireAdminMiddleware` instead; see
  `SECURE_AUTH_IMPLEMENTATION.md`.)
- **Identity comes from the session only.** User-scoped procedures use
  `ctx.user.id`; no input field selects the acting user.
- **Ownership:** `findAccessibleBooking` (`bookings.ts`) adds
  `bookings.userId = ctx.user.id` unless `allowAdmin` is set and the caller is
  an admin in D1 (`isActiveAdmin`; only checked when the session claims the
  admin role). A booking that exists but is not the caller's is `NOT_FOUND`.
  `getBooking`, `cancelBooking`, `createCheckoutSession`, `refreshBooking` and
  `confirmCheckout` are owner-only even for admins; admins use
  `adminGetBooking` and `adminCancelBooking`.
- **Admin role and bans:** the session comes from `getSession` with Better
  Auth's 5-minute cookie cache. `adminProcedure` therefore re-reads role and
  ban status from D1 on every call, so revoking a role or banning an admin
  applies to the next call. `protectedProcedure` rejects a banned session user
  (Better Auth also deletes a banned user's sessions).
- **Browser side:** the QueryClient's query and mutation caches
  (`src/router.tsx`, `createAuthErrorHandler` in `src/lib/session.ts`) refresh
  the session and re-run the route guards when a call fails with
  `UNAUTHORIZED` or `FORBIDDEN` (at most every 10 s). The admin layout reads a
  database-fresh session (`freshSessionQueryOptions`) on each SSR load and at
  most every 30 minutes during client navigation.
- **Guest responses** select explicit guest columns (`GUEST_BOOKING_FIELDS`);
  never the full row or payment transaction.
- **Rate limits:** see `rateLimit` above, and Better Auth's D1-backed limits
  plus the `AUTH_RATE_LIMITER` binding in front of `/api/auth/*`
  (`SECURE_AUTH_IMPLEMENTATION.md`).
- **Public outputs must never contain** iCal feed URLs, the room
  `icalExportToken`, booking ids, booking `publicId`s or confirmation ids, or
  guest data (name, email, phone, special requests). Public procedures select
  explicit columns (`publicRoomColumns`, the `availability.getBySlug` room
  select); availability conflicts sent to guests are dates only
  (`publicConflicts` in `booking-service.ts`).
- **Prices are computed on the server.** `createBookingSchema` accepts client
  price fields for compatibility and ignores them; `quoteStay` is the single
  price calculation for the calendar, checkout and the hold.
- **Validation:** every procedure that takes input validates it with Zod.
  Shared schemas live in `src/lib/payment-validation.ts`,
  `src/lib/room-validation.ts`, `src/lib/cancellation-policy.ts`;
  `publicIdSchema` (`src/lib/ids.ts`, 16 chars `[0-9a-z]`), `idSchema`
  (UUIDv7 primary keys in admin inputs) and `isoDateSchema`
  (`src/lib/date-range.ts`) are reused. Small inputs are inline.
- **Errors:** unexpected errors are hidden from clients by `errorFormatter` and
  logged by the handler's `onError`. Do not log input, payment payloads or
  session data.
- **Server-only modules:** `context.ts`, `inner-context.ts`, `router.ts` and
  `src/lib/deps.ts` import `cloudflare:workers` or secrets. Components and
  routes import only `react.ts`, `errors.ts`, `types.ts` and `import type`
  from `router.ts`; `client.ts` is isomorphic and imported only by
  `src/router.tsx`.

## Other HTTP endpoints

| Route | File | Methods | What |
|---|---|---|---|
| `/api/auth/*` | `src/routes/api/auth.$.ts` | GET, POST, PUT, DELETE, PATCH, OPTIONS | Better Auth handler (`src/lib/auth.ts`): email/password, magic link, admin, Stripe customer plugin (customer creation only; its webhook path `/api/auth/stripe/webhook` is disabled and returns 404), Turnstile `captcha` on sign-in, sign-up, magic link and password reset. Route middleware `rateLimitRequests('AUTH_RATE_LIMITER')` (30 per minute per IP), then Better Auth's own D1 limits; every 429 is logged as `rate-limited`. Returns `500 Auth error` if the handler throws |
| `/api/csp-report` | `src/routes/api/csp-report.ts` | POST | CSP violation reports (`report-uri` and `report-to` formats), `handleCspReport` (`src/lib/csp-report.ts`). Logs one `csp-violation` line per report to Workers Logs (directive, blocked origin, document path, disposition); stores nothing. Rate-limited per IP (`CSP_REPORT_RATE_LIMITER`). 204, or 400/413/415 |
| `/api/stripe/webhook` | `src/routes/api/stripe.$.ts` | POST | Booking webhook, `handleStripeWebhook` (`src/lib/stripe-webhook.ts`). Requires JSON and a `stripe-signature` verified with `STRIPE_TRPC_WEBHOOK_SECRET`. Handles `checkout.session.*` (confirm, processing, release), `refund.*` and `charge.refunded` (refund sync, Dashboard refund emails), `charge.dispute.*` (disputes), `payment_intent.payment_failed` (log); the list is in `STRIPE_WEBHOOKS.md`. Other paths under `/api/stripe` are 404 |
| `/api/ical/<room publicId>/<token>.ics` | `src/routes/api/ical.$.ts` | GET | iCal export feed, `handleIcalExportRequest` (`src/lib/ical-export.ts`). Token compared in constant time; any mismatch is a plain 404. See `ICAL_SYNC_README.md` |
| `/api/trpc/*` | `src/routes/api/trpc.$.ts` | GET, POST | tRPC |

The session for route guards comes from the `getSessionFn` server function
(`src/core/functions/auth-server.ts`), not from tRPC. It returns a reduced
`SessionUser` (no token, IP or user agent).

Every response also passes the global request middleware in `src/start.tsx`:
security headers (`src/lib/security-headers.ts`: `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, and on non-`/api/` responses a
`Content-Security-Policy-Report-Only` with `Reporting-Endpoints`) and Start's
CSRF check for server functions.

## Calling procedures from the client

Route loaders preload into the per-request `QueryClient` through
`context.trpc`; components read the same query with `useTRPC()`:

```tsx
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';

export const Route = createFileRoute('/_authed/account/booking/$publicId')({
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.bookings.getBooking.queryOptions({
					publicId: params.publicId,
				}),
			),
		),
	notFoundComponent: BookingNotFound,
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(
		trpc.bookings.getBooking.queryOptions({ publicId }),
	);
	const resend = useMutation(
		trpc.bookings.resendConfirmationEmail.mutationOptions({
			onSuccess: () => toast.success('Email sent'),
		}),
	);
	// ...
}
```

(Abridged from `src/routes/_authed/account/booking.$publicId.tsx`.)

- Loaders: `context.queryClient.ensureQueryData(context.trpc.<router>.<proc>.queryOptions(input))`.
  Wrap in `orNotFound` when the route has a `notFoundComponent`. Use
  `prefetchQuery` for optional data (it never throws; see
  `src/routes/_authed/_admin/admin/bookings/$publicId.tsx`).
- Components: `useSuspenseQuery` for data the loader preloaded, `useQuery` for
  client-only or optional data (e.g. `src/components/RoomAvailabilityCalendar.tsx`),
  `useMutation(trpc.<router>.<proc>.mutationOptions({ ... }))` for writes.
- After a mutation, invalidate with filters from the proxy:
  `queryClient.invalidateQueries(trpc.bookings.pathFilter())` (whole router) or
  `trpc.rooms.get.pathFilter()` (one procedure).
- Output types: `RouterOutputs` from `src/integrations/trpc/types.ts`.
- Do not call Stripe, D1 or Better Auth server APIs from components.

## Adding a procedure

1. Put the input schema in the matching `src/lib/*-validation.ts` (or inline if
   it is small and used once). Use `publicIdSchema` / `idSchema` /
   `isoDateSchema` for ids and dates.
2. Add the procedure to the router file with the narrowest builder:
   `adminProcedure` for admin data, `protectedProcedure` plus an ownership
   check (`findAccessibleBooking` for bookings) for user data,
   `publicProcedure` only when anonymous access is intended.
3. Put business logic in a `src/lib` service that takes `ServiceDeps` (pass
   `ctx`), so the webhook, cron and tests can share it.
4. Throw `TRPCError` with the codes above; put structured details in
   `cause: { conflict }` or `cause: { conflicts }`. Select explicit columns
   for public and guest responses. Let unexpected errors propagate (no
   try/catch that logs and rethrows). Add `.use(rateLimit(...))` to public or
   expensive procedures.
5. A new router goes into `trpcRouter` in `src/integrations/trpc/router.ts`.
6. Tests: public procedures go into `PUBLIC` in
   `test/workers/trpc-authz.test.ts` and get a case in
   `test/workers/trpc-public-leaks.test.ts`; user procedures go into `USER`.
   Anything not listed is expected to be admin-only (the sweep fails
   otherwise). Add behaviour tests in `test/workers/`.
7. Run the workflow in `AGENTS.md` (`pnpm check`, `pnpm typecheck`,
   `pnpm test`, build and `pnpm check:bundle`).

## Tests

Worker tests (`pnpm test:workers`) call procedures through
`trpcRouter.createCaller(makeCtx(role, overrides?))` (`test/workers/helpers.ts`;
roles `admin`, `user`, `other`, `null`; `overrides` sets a stale `role` or a
`banned`/`banExpires` on the session user), using `createInnerTRPCContext` with
a synthetic session.

| Test | Covers |
|---|---|
| `test/workers/trpc-authz.test.ts` | Sweeps every procedure: anything not in `PUBLIC` rejects anonymous callers with `UNAUTHORIZED`; anything not in `PUBLIC` or `USER` rejects normal users with `FORBIDDEN`; removed procedures stay removed |
| `test/workers/trpc-public-leaks.test.ts` | Public outputs (`rooms.list`, `rooms.get`, `rooms.calculatePricing`, `bookings.calculateBooking`, `availability.getBySlug`, `policies.getCancellationPolicy`) contain no feed URL, export token, guest data or booking ids |
| `test/workers/access-freshness.test.ts` | `adminProcedure` reads role/ban from D1 (stale admin session, revoked role, banned admin); `protectedProcedure` rejects banned users |
| `test/workers/bookings.test.ts` | Date overlap, pending holds, pricing, ownership (`NOT_FOUND` for other users), guest response shape, `adminGetBooking`, resend by `publicId`, cancellation |
| `test/workers/rooms-visibility.test.ts` | Public `list`/`get` return active rooms only; `adminList`/`adminGet` return every status |
| `test/workers/admin-inputs.test.ts`, `users.test.ts` | Admin input validation (ids, dates, single date bound); guest details columns; phone `CONFLICT` |
| `test/workers/ical-test-url.test.ts` | `testUrl` / feed URL rules (https, no IP or localhost, redirects, size cap) |
| `test/workers/rate-limit.test.ts`, `auth-rate-limit.test.ts`, `csp-report.test.ts` | Rate limiting bindings and the `rateLimit` middleware, Better Auth's D1 limits, the CSP report endpoint |
| `test/workers/booking-integrity.test.ts` | Same-day cutoff and limits on `createBooking` / `calculateBooking`, `availability.getBySlug` times, quote drift, partial refunds, save-then-refund, `getMyBookings` phases |
| `test/workers/checkout.test.ts` | `createCheckoutSession` parameters, reuse and replacement; `confirmCheckout` verification, processing, taken-dates refund, idempotency; the hold priority rule |
| `test/workers/blocks.test.ts`, `pricing-rules.test.ts`, `rooms-max-guests.test.ts` | Block conflicts, pricing rule overlap and per-night prices, guest limit |
| `test/workers/ical-route.test.ts`, `ical-sync.test.ts` | Export feed access and contents, admin feed procedures, sync |
| `test/workers/stripe-webhook.test.ts` | Webhook signature, `checkout.session.*`, refunds (Dashboard and app), `charge.refunded`, disputes |
| `test/unit/validation.test.ts` | Zod schemas |
