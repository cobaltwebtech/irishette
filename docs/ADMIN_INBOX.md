# Admin notification inbox

An internal list of things the admins should look at: Stripe events, system
problems and contact form messages. Shown in the admin dashboard under
**Notifications** (`/admin/inbox`), with an unread badge in the sidebar. The
admin alert emails still go out (to the admins who have that email category
on in `/admin/settings`, see `SECURE_AUTH_IMPLEMENTATION.md`); the inbox is
the record in the dashboard, whatever the email settings.

Plan 02 Phase 4 (2026-11-08). Guest messaging (replying from the dashboard,
inbound email) is deferred: `.agents/plans/deferred-email-messaging.md`.

## Files

| File | What |
|---|---|
| `src/db/inbox-schema.ts` | `admin_inbox_items` table |
| `src/lib/inbox/inbox.ts` | Sources, kinds, statuses, labels, the per-kind `details` types, `stripePaymentUrl`, `stripeDisputeUrl`, `contactReplyHref` (shared, client-safe) |
| `src/lib/inbox/inbox-validation.ts` | Zod inputs of the procedures, the keyset cursor, the page's search params |
| `src/lib/inbox/inbox-service.ts` | `createInboxItem` / `createInboxItemInBackground` (server-only) |
| `src/integrations/trpc/inbox.ts` | The `inbox` tRPC router (all admin; see `TRPC_QUICK_REFERENCE.md`) |
| `src/routes/_authed/_admin/admin/inbox/index.tsx` | The list (server-paginated TanStack Table, filters, bulk actions) |
| `src/routes/_authed/_admin/admin/inbox/$publicId.tsx` | One item (marks it read on open) |
| `src/components/admin/inbox/` | Badges, the per-kind detail view, the booking/guest panel, the data hooks (`use-inbox.ts`) |

## Sources and kinds

Every item has a `source` (a tag in the UI and a filter) and a `kind`.

| Kind | Source | Created by | Dedupe key | Linked to |
|---|---|---|---|---|
| `contact_form` | `guest` | The contact form (`src/lib/inbox/contact-service.ts`, `CONTACT_FORM.md`) | none (one item per message) | nothing (the guest is not looked up) |
| `payment_released` | `system` | `releaseAuthorization` / `failAuthorizedBooking` (`checkout-service.ts`, plan 05): the guest paid (card authorized) but the booking could not be confirmed (dates taken, booking cancelled or deleted, paid with another session, session mismatch) or the authorization could not be captured; it was cancelled, nothing charged, no refund. Details: confirmation id (null if the booking is gone), room, dates, amount, session, PaymentIntent, reason, livemode | `payment_released:<paymentIntentId>` | booking and guest when the booking exists |
| `refund_auto` | `system` | **Legacy, nothing creates it any more** (replaced by `payment_released`): the old automatic refund when the dates were taken. Kept so existing rows still render | `refund_auto:<bookingId>` | booking, guest |
| `refund_failed` | `stripe` | Webhook `refund.failed` / `refund.updated` to `failed` (`refund-service.ts`), once per refund | `refund_failed:<refundId>` | booking and guest when found |
| `refund_issued` | `stripe` | A refund made in the Stripe Dashboard (`refund.created` / `refund.updated`, `refund-service.ts`); app refunds get none. Resurfaces on each status change | `refund:<refundId>` | booking, guest |
| `payment_dispute` | `stripe` | `charge.dispute.*` (`dispute-service.ts`). No email. Resurfaces on every **newer** Stripe event; replays and older events change nothing (`payment_disputes.last_stripe_event_*`) | `dispute:<stripeDisputeId>` | booking and guest when linked, and the dispute (`payment_dispute_id`) |
| `ical_sync_failed` | `system` | `alertFeedProblem` (`ical-sync.ts`): a healthy feed starts failing | `ical_sync_failed:<feedId>:<YYYY-MM-DD CT>` | nothing (room link in details) |
| `ical_conflict` | `system` | `alertConflicts` (`ical-sync.ts`): an imported event overlaps a booking or hold | `ical_conflict:<feedId>:<hash of the conflict set>`, resurfaces at most daily | the first conflicting booking |

Deleting a `payment_dispute` item removes only the notification; the dispute
record in `payment_disputes` stays (a financial record).

`details` is small JSON (`InboxDetailsByKind` in `src/lib/inbox/inbox.ts`): amounts,
Stripe ids, room and feed names, the problem text. Never secrets, card data
or whole webhook payloads. Contact form items hold the message as the guest
typed it (unverified).

## Table: `admin_inbox_items`

| Column | Notes |
|---|---|
| `id`, `public_id` | UUIDv7 key; 16-char public id for URLs |
| `source`, `kind` | See above |
| `title`, `summary` | Short text for the list |
| `details` | JSON (above) |
| `status` | `new` \| `read` \| `archived`, shared by all admins; `read_at`, `archived_at` |
| `booking_id`, `user_id` | Optional links, `ON DELETE SET NULL` |
| `payment_dispute_id` | `payment_dispute` items: the dispute (`payment_disputes.id`), `ON DELETE SET NULL` |
| `dedupe_key` | Unique, nullable |
| `occurrences` | 1 + the number of repeats of the dedupe key |
| `surfaced_at` | When it was last put in front of admins (created or resurfaced). The list order |
| `created_at`, `updated_at` | |

Indexes: `(status, surfaced_at, public_id)` for the list, `(source, status,
surfaced_at)`, `(booking_id, surfaced_at)`, `(user_id, surfaced_at)`, unique
`public_id` and `dedupe_key`. SQLite walks them backwards for the
newest-first order.

Items are kept until an admin deletes them (no cron).

## Creating items: `createInboxItem(deps, item, options?)`

- Inserts the item, or, when `dedupeKey` is already there, updates its title,
  summary, details and links, adds one to `occurrences` and **resurfaces** it:
  `status` back to `new`, `read_at`/`archived_at` cleared, `surfaced_at` now
  (top of the list).
- `resurfaceAfterSeconds`: on a repeat, resurface only if the item last
  surfaced at least that long ago (otherwise it is counted and updated
  silently). Used for conflicts, which every 30-minute sync finds again.
- Never throws. A failure logs one line
  (`{"message":"inbox-item-failed","kind","dedupeKey","error"}`) and returns
  `null`, so callers can run it next to their main work. Request handlers use
  `createInboxItemInBackground` (`waitUntil`); the cron sync awaits it.

## The pages

- **List** (`/admin/inbox`): search params `view` (`inbox` = new + read,
  `new`, `archived`), `source`, `kind`, `q`, `cursor`, `dir`, `pageSize`
  (10/25/50/100). **Keyset pagination** on `(surfaced_at, public_id)`:
  "Newer" / "Older" buttons, no page numbers; a new item arriving does not
  shift the page you are on. The total comes from `adminCount`, which only
  refetches when the filters change. The next page is prefetched. Rows:
  unread dot and bold title, ×N for repeats, source tag and kind, links to
  the booking and guest. Bulk: mark read / unread, archive / move to inbox,
  delete (with a confirmation).
- **Item** (`/admin/inbox/$publicId`): rendered by kind
  (`InboxItemDetails.tsx`), with links to the booking, the guest, the room's
  calendar settings or the Stripe Dashboard payment. Contact messages have a
  **Reply by email** button: a `mailto:` link to the address the guest typed,
  with `Re: <subject>`, which opens the admin's own mail client. Opening an
  unread item marks it read.
- **Panels:** the admin booking and guest pages show the latest 20 linked
  items (`NotificationsPanel`), hidden when there are none.
- **Badge:** `inbox.adminUnreadCount`, cached by TanStack Query, refetched
  every 5 minutes and on window focus.
- **Status changes are optimistic:** rows, the open item and the badge update
  at once, roll back on an error, then every inbox query is refetched
  (`trpc.inbox.pathFilter()`) so the server wins.

## Adding a kind

1. Add it to `inboxKinds`, `INBOX_KIND_LABELS`, `INBOX_KIND_SOURCE` and
   `InboxDetailsByKind` in `src/lib/inbox/inbox.ts` (a new source also needs
   `inboxSources`, `INBOX_SOURCE_LABELS` and a style in
   `src/components/admin/inbox/inbox-ui.tsx`). Kinds and sources are TEXT
   columns, so no migration is needed.
2. Call `createInboxItem` (or the background variant) where it happens, with
   a dedupe key if the event can repeat (webhook replays, cron runs).
3. Render it in `InboxItemDetails.tsx`.
4. Test it (see `test/workers/inbox.test.ts`, and the caller's own tests) and
   add a row to the table above.
