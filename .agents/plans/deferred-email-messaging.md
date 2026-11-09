# Guest Email Messaging (DEFERRED)

Status: **DEFERRED** (decided 2026-11-08). Out of scope: the client has not asked for it. Do not start this work without the user's explicit go-ahead. It was split out of plan 02 Phase 4, which now ships only an email-only contact form and an internal admin notification inbox (Stripe and system events).

Read `AGENTS.md` first if this plan is picked up. Re-verify everything marked **VERIFY**: Cloudflare Email Service was in public beta when this was written and changes quickly.

---

## 1. What this would add

**Already done (plan 02 Phase 4, 2026-11-08):** contact form messages are stored as admin notifications (`admin_inbox_items`, source `guest`, kind `contact_form`) with a `mailto:` reply button. This plan would add threads, dashboard replies and inbound mail on top of that (`docs/CONTACT_FORM.md`, `docs/ADMIN_INBOX.md`).

A small ticketing system inside the admin dashboard:
- Contact form messages are stored in D1 and shown in the admin inbox (not only emailed).
- Admins reply from the dashboard. The reply is emailed to the guest and stored in a thread.
- When the guest replies to that email, the reply comes back into the app (not the admin's mail client) and is added to the same thread.
- Messages show on the admin booking and guest pages. A guest-facing message history in `/account` could follow.

## 2. Why it is deferred

- The client has not specified it. Plan 02 keeps the contact form simple: the admin receives an email with the form data (with the guest as reply-to) and answers from their own mail client.
- Two-way email needs inbound mail handling (DNS/MX changes on the client's domain) and a new sending provider. That affects every email the app sends, not only the inbox.

## 3. Research so far (2026-11-08; VERIFY before use)

Cloudflare Email Service can replace Resend for sending and also receive mail into the Worker:

| Piece | Finding |
|---|---|
| Sending | `send_email` Workers binding, no API key. `@cloudflare/config` 0.30.2 (used by `cf` / `cloudflare.config.ts`) has `bindings.sendEmail(options?)`. `env.EMAIL.send({ from, to, subject, html, text, replyTo, headers })`. Sender restrictions per binding are possible. |
| Receiving | Email Routing invokes an `email(message, env, ctx)` handler on the Worker; `@cloudflare/config` has `triggers.email({ addresses: [...] })`. Export it from `src/server.ts` next to `fetch` and `scheduled`. Parse `message.raw` (single-use stream) with `postal-mime`. `message.from` (envelope) is trustworthy; header addresses can be spoofed. Inbound limit 25 MiB. |
| Local dev | Without remote bindings, `send()` is simulated (logged, not sent), which is safer than Resend for local testing. |
| Plan / status | Email Sending is in **public beta** (since 2026-04-16). Sending to arbitrary recipients needs the **Workers Paid** plan; Email Routing works on Free. New accounts start with a low daily sending quota that grows with reputation. |
| DNS | The domain must use **Cloudflare DNS**. Email Routing needs **exclusive control of the root domain's MX records**, so it cannot coexist with Google Workspace / Microsoft 365 / another provider on the same domain. Subdomains can be added to Email Routing from the apex domain's settings (**VERIFY** whether the apex must itself be onboarded, which would take over its MX). Email Sending adds records on a `cf-bounce` subdomain and a `_dmarc` record; it does not need MX on the root. |
| Templates | react-email templates keep working (render to `html` + `text`). `src/lib/email-service.ts` is already the single gateway, so the provider swap is contained there. |

## 4. Proposed design (draft)

- **Threading:** the admin's reply is sent from an address like `reply+<threadPublicId>@<mail domain>` with `In-Reply-To` / `References` set to the previous Message-ID. Inbound mail is matched by the token in the recipient address first, then by `In-Reply-To` / `References`. Mail that matches no thread is stored as a new message (or rejected; decide).
- **Schema (D1):**
  - `contact_threads` (or reuse a `contact_messages` row as the thread root): guest name, email, optional phone, subject, optional booking / user links, status lives on its inbox item.
  - `contact_thread_messages`: `direction` (`inbound` | `outbound`), `body_text`, `message_id`, `in_reply_to`, `admin_user_id` (outbound), `provider_message_id`, `created_at`.
  - A `guest` source and `contact_message` / `guest_reply` kinds in the existing `admin_inbox_items` table (plan 02 Phase 4 builds that table with `source` and `kind` columns so these can be added later).
- **Safety:** store and render plain text only (never guest HTML in the dashboard); size cap; no attachments at first (R2 later if needed); log only public ids; rate-limit/flag senders; never auto-reply from the `email()` handler.
- **Provider swap:** move all outbound email (booking, auth, admin alerts) from Resend to the `send_email` binding in one step, behind `email-service.ts`, with its own gate and test pass. Then add inbound.

## 5. Questions for the user before starting

1. Is `irishette.com` on Cloudflare DNS, and does another provider (for `info@irishette.com`) receive mail for it today?
2. Is the Cloudflare account on Workers Paid?
3. Which address/subdomain should guests reply to (e.g. `reply.irishette.com`)?
4. Should unmatched inbound mail create a new thread or be rejected?
5. Does the guest need a message history in `/account`?

## 6. Rough phases (if approved)

1. Verify DNS, plan and domain setup (no code).
2. Swap outbound email from Resend to Email Service (`email-service.ts`, bindings, tests, docs, Varlock/`RESEND_API_KEY` cleanup).
3. Store contact messages and admin replies (schema, inbox kind, dashboard thread view, reply form).
4. Inbound replies (`email()` handler, parsing, threading, tests with sample MIME fixtures).
