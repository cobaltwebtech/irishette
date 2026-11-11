# Contact form

`/contact` (`src/routes/contact.tsx`). Plan 02 Phase 4 (2026-11-08).

A guest's message is emailed to the site's contact address **and** stored as
a notification in the admin dashboard (`ADMIN_INBOX.md`, source `guest`, kind
`contact_form`). Admins answer from their own mail client: "Reply" in the
email, or **Reply by email** (a `mailto:` link) on the notification. Nothing
is sent to the guest. Replying from the dashboard and two-way email are
deferred (`.agents/plans/deferred-email-messaging.md`).

## Flow

1. The form (name, email, optional phone, subject, optional booking
   confirmation ID, message) validates with `contactSchema`
   (`src/lib/inbox/contact-validation.ts`) in the browser for field errors, and
   needs a Turnstile token (invisible widget, `TurnstileField`). Signed-in
   guests get their name, email and phone prefilled; `?booking=ABC123`
   prefills the confirmation ID.
2. It calls the server function `submitContactFn`
   (`src/core/functions/contact.ts`, `POST`):
   - `rateLimitFnMiddleware('API_RATE_LIMITER', 'contact.submit')`
     (`src/core/middleware/rate-limit.ts`): keyed by IP. Over the limit:
     HTTP 429, `Retry-After: 60`, the usual `rate-limited` log line, and an
     error the form shows ("Too many requests...").
   - `.validator(contactSchema)`: the same schema again on the server.
   - The handler calls `submitContactForm` (`src/lib/inbox/contact-service.ts`).
3. `submitContactForm(deps, input, ip)`:
   - `verifyTurnstile` (`src/lib/inbox/turnstile.ts`): Siteverify with
     `TURNSTILE_SECRET_KEY`, the token and `remoteip` (`cf-connecting-ip`),
     10 s timeout. **Fails closed** (network error, timeout, non-2xx,
     unreadable body). Checks `success` only (the `hostname` / `action`
     checks were not adopted).
   - Stores the `contact_form` notification (`createInboxItem`).
   - Emails `CONTACT_EMAIL` (`src/lib/site.ts`) from `EMAIL_FROM_ADMIN` with
     `replyTo` = the guest's address (`sendContactNotification` in
     `email-service.ts`), with a link to the notification.
   - Returns `{ ok: true }` when the message was stored **or** emailed, so
     the admins see it somewhere. Otherwise `{ ok: false, reason }`:
     `turnstile` (rejected token), `unavailable` (Siteverify unreachable),
     `send_failed` (neither worked). The form maps each to a message that
     points to `CONTACT_EMAIL`. Nothing else leaks.
4. The form resets the Turnstile widget after every request (tokens are
   single-use) and shows "Thanks, your message is on its way" on success.

## Validation (`contactSchema`)

| Field | Rule |
|---|---|
| `name` | trimmed, 2-100 |
| `email` | email, max 254 |
| `phone` | optional; `phoneNumberSchema` (max 20 chars, at least 10 digits); blank = absent |
| `subject` | trimmed, 1-150, **one line** (it becomes an email subject) |
| `message` | trimmed, 10-5000 |
| `bookingConfirmationId` | optional; uppercased; `^[A-HJ-NP-Z0-9]{6}$`. Format only: never looked up, so a guest cannot probe bookings |
| `turnstileToken` | 1-2048 |

## Privacy

- The message is stored in D1 (`admin_inbox_items.details`) until an admin
  deletes it, and is in the admin's mailbox. Only admins can read it.
- Logs never include the message, the guest's name or email (`email-service`
  logs the kind of email only; Turnstile logs only Siteverify error codes).
- The reply link encodes the address so it cannot add mail headers.

## Testing

- Unit (`test/unit/contact.test.ts`): the schema, the reply link, the
  middleware wiring (429, `Retry-After`, the handler does not run).
- Workers (`test/workers/contact.test.ts`): Turnstile pass / reject / 500 /
  timeout (msw), the stored item, the email (to `CONTACT_EMAIL`, reply-to the
  guest), the email failing while the item is stored.
- E2E (`e2e/contact.spec.ts`): the page and field errors. **Submitting sends a
  real email through Cloudflare Email Service in `pnpm dev`**, so that test runs only with
  `E2E_CONTACT=1`. Locally, use the Turnstile test keys (site key
  `1x00000000000000000000AA`).
