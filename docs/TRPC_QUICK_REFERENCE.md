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
| `src/integrations/trpc/router.ts` | `trpcRouter` (`rooms`, `bookings`, `availability`, `ical`, `policies`, `users`) and the `TRPCRouter` type |
| `src/integrations/trpc/{rooms,bookings,availability,ical,policies,users}.ts` | The routers |
| `src/integrations/trpc/client.ts` | `makeTRPCClient`: `localLink` on the server, `httpBatchLink` in the browser |
| `src/integrations/trpc/react.ts` | `TRPCProvider` and `useTRPC` (`@trpc/tanstack-react-query`) |
| `src/integrations/trpc/batching.ts` | `MAX_BATCH_SIZE = 20`, shared by the client link (`maxItems`) and the handler (`maxBatchSize`) |
| `src/integrations/trpc/errors.ts` | `orNotFound(promise)`: turns a tRPC `NOT_FOUND` into the router's `notFound()` in loaders |
| `src/integrations/trpc/types.ts` | `RouterOutputs` (e.g. `RouterOutputs['bookings']['getMyBookings']`) |
| `src/routes/api/trpc.$.ts` | HTTP handler (`fetchRequestHandler`) for `GET`/`POST /api/trpc/*` |
| `src/router.tsx` | `getRouter`: per-request `QueryClient`, tRPC client, options proxy and provider |
| `src/lib/deps.ts` | `ServiceDeps` / `createServiceDeps`: the `db`, `env`, `stripe`, `waitUntil` part of the context |
| `src/lib/*-validation.ts` | Zod input schemas (`payment-validation.ts`, `room-validation.ts`) |

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
| `protectedProcedure` | `ctx.session` and `ctx.user` set; narrows both to non-null | `UNAUTHORIZED` |
| `adminProcedure` | `protectedProcedure`, then `ctx.user.role === 'admin'` | `UNAUTHORIZED` (anonymous), `FORBIDDEN` (not admin) |

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
| `FORBIDDEN` | Signed in, not admin (middleware) |
| `NOT_FOUND` | Missing row, **and** a booking that exists but belongs to someone else (no existence leak) |
| `BAD_REQUEST` | Zod input errors; business rules (past dates, guest count over `maxGuests`, inactive room, end before start, resend for a non-confirmed booking) |
| `CONFLICT` | Dates taken (`createBooking` sends `cause.conflicts` with dates only), payment confirmed after the dates were taken (refunded), overlapping pricing rule (`cause.conflict`), block over reservations or another block (`cause.conflicts`), unique violations (room slug, feed URL, phone number), stale booking state |
| `PRECONDITION_FAILED` | Refund requested for a booking without a Stripe payment |
| `INTERNAL_SERVER_ERROR` | Anything unexpected (logged by `onError`, message hidden) |

Client helpers: `orNotFound` (loaders), `isTRPCClientError<TRPCRouter>(error)`
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
| `list` | query | public | `getRoomsSchema` (`limit` 1-100, default 10; `offset`; optional `status`) | Rooms ordered by name, with `pagination` (`total`, `hasMore`). No status filter by default |
| `get` | query | public | `getRoomSchema` (one of `{ id }`, `{ publicId }`, `{ slug }`) | One room, any status. `NOT_FOUND` if missing |
| `calculatePricing` | query | public | `calculatePricingSchema` (`roomId`, `checkInDate`, `checkOutDate`; `guestCount` ignored) | Base price per night with applied pricing rules (calendar). Uses `quoteStay` |
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

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `calculateBooking` | query | public | `calculateBookingSchema` (`roomId`, dates, `guestCount`) | Full price (base, fees, taxes, nights, applied rules, tax breakdown). Same `quoteStay` as booking creation |
| `createBooking` | mutation | user | `createBookingSchema` (room, dates, guest count/name/email/phone, special requests; client prices ignored) | `createHold`: 30-minute pending hold; returns `bookingId`, `publicId` |
| `createPaymentIntent` | mutation | user (owner) | `bookingIdSchema` | `preparePayment`: PaymentIntent for the Payment Element; returns `clientSecret`, `publishableKey` |
| `refreshBooking` | mutation | user (owner) | `bookingIdSchema` | `refreshHold`: extend an expired hold if the dates are still free |
| `confirmPayment` | mutation | user (owner) | `confirmPaymentSchema` (`bookingId`, `paymentIntentId` `pi_...`) | `confirmBookingPayment` after Stripe.js success (idempotent; the webhook is the backup). `CONFLICT` if the dates were taken and the payment was refunded |
| `getBooking` | query | owner or admin | `bookingPublicIdSchema` | Booking, room (`bookingRoomColumns`) and payment transaction; `user` is the guest for admins, `null` for owners |
| `getMyBookings` | query | user | `{ limit 1-100 (10), offset, status? }` | The caller's bookings with room summary, newest first |
| `getCancellationQuote` | query | owner or admin | `bookingPublicIdSchema` | Whether the booking can be cancelled now and the refund under its policy |
| `cancelBooking` | mutation | user (owner only) | `cancelBookingSchema` (`publicId`, `reason?`) | Guest cancellation, refund per policy |
| `adminCancelBooking` | mutation | admin | `adminCancelBookingSchema` (`publicId`, `refund: 'full' \| 'policy' \| 'none'`, `reason?`) | Admin cancellation with chosen refund |
| `resendConfirmationEmail` | mutation | owner or admin | `bookingIdSchema` | Re-send the confirmation email; `BAD_REQUEST` unless confirmed |
| `adminListBookings` | query | admin | `{ limit 1-100 (10), offset, status?, paymentStatus?, roomId?, startDate?, endDate? }` | All bookings with room and guest (id, email, name); check-in range applied only when both dates are given |
| `adminUpdateInternalNotes` | mutation | admin | `{ bookingId, internalNotes (max 5000) }` | Set a booking's internal notes |
| `adminGetMonthlyStats` | query | admin | `{ months 1-24 (12), status: 'confirmed' \| 'all' }` | Booking count and revenue per check-in month |

### `availability` (`src/integrations/trpc/availability.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `getBySlug` | query | public | `{ roomSlug, startDate?, endDate?, monthsAhead 1-12 (10) }` (ISO dates) | Active room summary and unavailable date ranges (`loadUnavailability`) for the booking calendar. Dates only: no booking ids, confirmation ids or guest data |

### `ical` (`src/integrations/trpc/ical.ts`)

All admin. Feed URLs and the export URL (which contains the room's token) are
returned only here. See `ICAL_SYNC_README.md`.

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `listFeeds` | query | admin | `roomIdSchema` | A room's import feeds (including `url`), sync state and stored event count |
| `createFeed` | mutation | admin | `createIcalFeedSchema` (`roomId`, `source`, `label?`, http(s) `url`, `isActive`) | Add a feed. `CONFLICT` on duplicate URL for the room |
| `updateFeed` | mutation | admin | `updateIcalFeedSchema` (`id` + optional fields) | Update a feed; a new URL resets etag, last-modified, counts and error |
| `deleteFeed` | mutation | admin | `{ id }` | Delete a feed and its imported events |
| `testUrl` | mutation | admin | `testIcalUrlSchema` (`url`) | Fetch a URL (10 s timeout) and report whether it is an iCal feed and its event counts |
| `syncRoom` | mutation | admin | `roomIdSchema` + `force` (default `false`) | "Sync now" for all of a room's feeds (`syncRoomFeeds`) |
| `syncFeed` | mutation | admin | `{ id, force (false) }` | Sync one feed (`syncFeed`) |
| `getSyncLogs` | query | admin | `{ roomId?, feedId?, limit 1-100 (20) }` | Sync runs, newest first, with feed label |
| `getSyncChanges` | query | admin | `{ syncLogId }` | What one run changed, with the overlapping booking's `publicId` / `confirmationId` |
| `getExportUrl` | query | admin | `roomIdSchema` | `BETTER_AUTH_URL` + `/api/ical/<publicId>/<token>.ics` |
| `regenerateExportToken` | mutation | admin | `roomIdSchema` | New export token; returns the new URL (the old one stops working) |

`roomIdSchema`, `createIcalFeedSchema`, `updateIcalFeedSchema` and
`testIcalUrlSchema` are in `src/lib/room-validation.ts`.

### `policies` (`src/integrations/trpc/policies.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `getCancellationPolicy` | query | public | none | Active cancellation policy (name, check-in time, timezone, tiers, `isDefault`), shown at checkout |
| `saveCancellationPolicy` | mutation | admin | `cancellationPolicyInputSchema` (`src/lib/cancellation-policy.ts`) | Save a new policy version for future bookings; existing bookings keep theirs |
| `listCancellationPolicies` | query | admin | none | All saved policy versions |

### `users` (`src/integrations/trpc/users.ts`)

| Procedure | Type | Access | Input | Purpose |
|---|---|---|---|---|
| `adminListGuests` | query | admin | `{ limit 1-100 (50), offset }` | Users with role `user`, with non-pending booking count, `total`, `hasMore` |
| `adminGetGuestDetails` | query | admin | `{ publicId }` (`publicIdSchema`) | A user's row and their non-pending bookings |
| `updatePhoneNumber` | mutation | user | `{ phoneNumber (min 10) }` | Set the caller's phone number |
| `updateProfile` | mutation | user | `{ name? (1-100), phoneNumber? (10-20) }` | Update the caller's name and phone. `CONFLICT` if the phone is taken. Email changes go through Better Auth's `changeEmail` |

## Security model

- **Auth is enforced in procedures, not routes.** The `_authed` and
  `_authed/_admin` layouts (`src/routes/_authed.tsx`,
  `src/routes/_authed/_admin.tsx`) only redirect for UX. Every procedure
  behind them is `protectedProcedure` or `adminProcedure`.
- **Identity comes from the session only.** User-scoped procedures use
  `ctx.user.id`; no input field selects the acting user.
- **Ownership:** `findAccessibleBooking` (`bookings.ts`) adds
  `bookings.userId = ctx.user.id` unless `allowAdmin` is set and the caller is
  an admin. A booking that exists but is not the caller's is `NOT_FOUND`.
  `cancelBooking`, `createPaymentIntent`, `refreshBooking` and `confirmPayment`
  are owner-only even for admins; admins cancel with `adminCancelBooking`.
- **Admin role:** `adminProcedure` checks `ctx.user.role === 'admin'` (Better
  Auth `admin` plugin). The session comes from `getSession` with the cookie
  cache, so a role change can take up to the cache age (5 minutes) to apply to
  tRPC calls. The admin layout re-checks with `freshSessionQueryOptions`
  (`src/lib/session.ts`), which bypasses the cache.
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
  `publicIdSchema` (`src/lib/ids.ts`, 16 chars `[0-9a-z]`) and `isoDateSchema`
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
| `/api/auth/*` | `src/routes/api/auth.$.ts` | GET, POST, PUT, DELETE, PATCH, OPTIONS | Better Auth handler (`src/lib/auth.ts`): email/password, magic link, phone number, admin, Stripe customer plugin (its own webhook under `/api/auth`, `STRIPE_BETTER_AUTH_WEBHOOK_SECRET`), Turnstile `captcha` on sign-in, sign-up, magic link and password reset. Returns `500 Auth error` if the handler throws |
| `/api/stripe/webhook` | `src/routes/api/stripe.$.ts` | POST | Booking webhook, `handleStripeWebhook` (`src/lib/stripe-webhook.ts`). Requires JSON and a `stripe-signature` verified with `STRIPE_TRPC_WEBHOOK_SECRET`. Handles `payment_intent.succeeded` (backup confirm), `payment_intent.payment_failed` (log), `charge.refunded` (payment status), `refund.failed` / failed `refund.updated` (admin alert). Other paths under `/api/stripe` are 404 |
| `/api/ical/<room publicId>/<token>.ics` | `src/routes/api/ical.$.ts` | GET | iCal export feed, `handleIcalExportRequest` (`src/lib/ical-export.ts`). Token compared in constant time; any mismatch is a plain 404. See `ICAL_SYNC_README.md` |
| `/api/trpc/*` | `src/routes/api/trpc.$.ts` | GET, POST | tRPC |

The session for route guards comes from the `getSessionFn` server function
(`src/core/functions/auth-server.ts`), not from tRPC. It returns a reduced
`SessionUser` (no token, IP or user agent).

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
   it is small and used once). Use `publicIdSchema` / `isoDateSchema` for ids
   and dates.
2. Add the procedure to the router file with the narrowest builder:
   `adminProcedure` for admin data, `protectedProcedure` plus an ownership
   check (`findAccessibleBooking` for bookings) for user data,
   `publicProcedure` only when anonymous access is intended.
3. Put business logic in a `src/lib` service that takes `ServiceDeps` (pass
   `ctx`), so the webhook, cron and tests can share it.
4. Throw `TRPCError` with the codes above; put structured details in
   `cause: { conflict }` or `cause: { conflicts }`. For public procedures,
   select explicit columns.
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
`trpcRouter.createCaller(makeCtx(role))` (`test/workers/helpers.ts`; roles
`admin`, `user`, `other`, `null`), using `createInnerTRPCContext` with a
synthetic session.

| Test | Covers |
|---|---|
| `test/workers/trpc-authz.test.ts` | Sweeps every procedure: anything not in `PUBLIC` rejects anonymous callers with `UNAUTHORIZED`; anything not in `PUBLIC` or `USER` rejects normal users with `FORBIDDEN`; removed procedures stay removed |
| `test/workers/trpc-public-leaks.test.ts` | Public outputs (`rooms.list`, `rooms.get`, `rooms.calculatePricing`, `availability.getBySlug`, `policies.getCancellationPolicy`) contain no feed URL, export token, guest data or booking ids |
| `test/workers/bookings.test.ts` | Date overlap, pending holds, pricing, ownership (`NOT_FOUND` for other users), cancellation |
| `test/workers/confirm-payment.test.ts` | `confirmPayment` verification, taken-dates refund, idempotency |
| `test/workers/blocks.test.ts`, `pricing-rules.test.ts`, `rooms-max-guests.test.ts` | Block conflicts, pricing rule overlap and per-night prices, guest limit |
| `test/workers/ical-route.test.ts`, `ical-sync.test.ts` | Export feed access and contents, admin feed procedures, sync |
| `test/workers/stripe-webhook.test.ts` | Webhook signature, `payment_intent.succeeded`, `charge.refunded` |
| `test/unit/validation.test.ts` | Zod schemas |
