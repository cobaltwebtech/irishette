# Go-live runbook

Production is one Cloudflare Worker named `irishette`, served only on
**https://www.irishette.com** (`workers.dev` is off). The Worker, the database
and every secret are separate from local development. Work through this top to
bottom; each step says who runs it. Nothing here is run by the coding agent.

Keep this file accurate: when a command, value or order changes, change it
here in the same commit.

## How production differs from development

One switch, `APP_ENV` (declared in `.env.schema`, `development` by default),
decides everything. Only these scripts set `APP_ENV=production`:

| Script | What it does |
|---|---|
| `pnpm build:prod` | Production build into `.cloudflare/output/` (nothing is uploaded) |
| `pnpm deploy:dry` | Production build plus `cf deploy --dry-run` (nothing is uploaded) |
| `pnpm run deploy` | Production build and **live deploy** (ask before running) |

`pnpm dev`, `pnpm build` and `pnpm preview` never set it, so they stay on the
dev database (`irishette-dev-1`) and dev values. There is no deploy script for
the dev configuration: `pnpm run deploy` is always production.

With `APP_ENV=production`:

- `cloudflare.config.ts` binds D1 `irishette-prod`
  (`bfd93ead-44a5-4541-aba0-6cb72cde7336`), serves the Worker on
  `www.irishette.com` and sets `workersDev: false`.
- Varlock also loads **`.env.production`** (gitignored, loaded after
  `.env.local`, so it wins) for the three values baked into the build.
- `cloudflare.config.ts` refuses to build if any of those is a dev value (see
  step 1), so a missing line cannot silently ship a localhost URL or a test key.

Heads-up: the pre-production deployment (`irishette.cobaltdev.workers.dev`) is
the same Worker name. The first production deploy replaces it, turns its
`workers.dev` URL off and points it at the empty production database. Do steps
4 and 8 back to back.

## 1. Build-time values: `.env.production` (you)

Create `.env.production` next to `.env.schema` (never commit it; `.env.*` is
gitignored). It holds only public values, so it needs no `varlock encrypt`:

```bash
BETTER_AUTH_URL=https://www.irishette.com
STRIPE_PUBLISHABLE_KEY=pk_live_...        # live publishable key (step 3)
VITE_TURNSTILE_PUBLIC_KEY=...             # production Turnstile site key (step 3b)
```

- `BETTER_AUTH_URL` must be exactly `https://www.irishette.com`: no trailing
  slash, not the apex. Better Auth and the server-function CSRF check trust
  only that origin.
- These three are baked into the build (they are not Worker secrets). Changing
  one means rebuilding and redeploying.
- Check it (the check decrypts `.env.local`, so it asks for Touch ID or your
  password): `APP_ENV=production pnpm env:check`.
- `varlock scan` (`pnpm env:scan`) should still pass: nothing here is a secret.

## 2. Production database (done)

D1 `irishette-prod` exists. If you ever recreate it, change the id in three
places: `D1.production` in `cloudflare.config.ts`, the `db:migrate:remote`
script in `package.json`, and `CLOUDFLARE_DATABASE_ID` in your local `.env` if
you use `pnpm db:studio:remote`. The dev id (`D1.development`) and
`DATABASE_ID` in `scripts/d1-local.mjs` must stay equal to each other.

## 3. Stripe live mode (you, in the Dashboard)

1. Activate the account for live payments.
2. Create a **restricted key** (Developers > API keys > Create restricted
   key). Permissions, and nothing else:
   - Checkout Sessions: **Write**
   - Customers: **Write**
   - PaymentIntents: **Write**
   - Charges and Refunds: **Write**
   - PaymentMethods: **Read**

   This is `STRIPE_SECRET_KEY` (step 4). If a checkout, capture or refund fails
   with a permission error, the message names the resource to add.
3. Copy the live **publishable** key (`pk_live_...`) into `.env.production`.
4. Create the **live webhook endpoint** (Developers > Webhooks):
   - URL: `https://www.irishette.com/api/stripe/webhook`. Use `www` directly:
     Stripe does not follow redirects, so an apex URL would fail every delivery.
   - API version: `2026-10-28.endive`. Payload style: snapshot. Events from:
     your account.
   - The 12 events (the same list as `docs/STRIPE_WEBHOOKS.md`):
     `checkout.session.completed`, `checkout.session.expired`,
     `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.updated`,
     `charge.dispute.closed`, `charge.dispute.funds_withdrawn`,
     `charge.dispute.funds_reinstated`, `payment_intent.payment_failed`.
   - Copy its signing secret (`whsec_...`) for `STRIPE_TRPC_WEBHOOK_SECRET`.
5. Settings > Payment methods: enable **Cards** (which covers Apple Pay and
   Google Pay) and **Link**. Nothing else (bank debits and delayed methods are
   not supported by authorize-then-capture).
6. Settings > Payment method domains: add `www.irishette.com` so Apple Pay and
   Google Pay appear in the Payment Element. Follow Stripe's on-screen
   verification; if it asks you to host a file, tell the agent so it can be
   added under `public/.well-known/`.
7. Delete the old sandbox endpoint for `irishette.cobaltdev.workers.dev` once
   the production deploy is live.

## 3b. Turnstile (you, in the Dashboard)

Turnstile > Add widget: hostname `www.irishette.com` only (no `localhost`;
the dev widget stays separate). Managed mode. Site key goes into
`.env.production` (`VITE_TURNSTILE_PUBLIC_KEY`); the secret key is
`TURNSTILE_SECRET_KEY` (step 4). Cloudflare's dummy keys (`1x0000...`,
`2x0000...`, `3x0000...`) are rejected by the production build.

## 4. Worker secrets (you; interactive, ask-the-owner steps)

Varlock does **not** upload secrets. Set the four production secrets on the
Worker. Each command prompts you to paste the value (nothing is echoed or
written to a file):

```bash
# New random value, straight to the clipboard (never reuse the dev secret):
openssl rand -base64 32 | pbcopy
pnpm dlx wrangler secret put BETTER_AUTH_SECRET --name irishette

pnpm dlx wrangler secret put STRIPE_SECRET_KEY --name irishette          # restricted live key (rk_live_...)
pnpm dlx wrangler secret put STRIPE_TRPC_WEBHOOK_SECRET --name irishette # live endpoint whsec_...
pnpm dlx wrangler secret put TURNSTILE_SECRET_KEY --name irishette       # production widget secret
```

Because the Worker already exists as pre-production, setting these swaps its
sandbox secrets for live ones immediately. Run step 8 right after.

If the Worker still has `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` from older deploys,
remove it: `pnpm dlx wrangler secret delete STRIPE_BETTER_AUTH_WEBHOOK_SECRET --name irishette`.

## 5. Cloudflare dashboard (you)

The `irishette.com` zone must be on the account.

- **Custom domain:** `cf deploy` attaches `www.irishette.com` (from
  `domains` in `cloudflare.config.ts`) and creates its DNS record and
  certificate. If `www` already has a DNS record (a CNAME or A record), delete
  it first or the attach fails.
- **Apex redirect (301):** Rules > Redirect Rules > Create rule.
  - When: Hostname equals `irishette.com`.
  - Then: Dynamic, expression `concat("https://www.irishette.com", http.request.uri.path)`,
    status 301, **Preserve query string** on.
  - Equivalent to `irishette.com/*` -> `https://www.irishette.com/$1`.
  - The rule only runs on proxied traffic, so the apex needs a **proxied** DNS
    record (for example an `A` record `irishette.com` -> `192.0.2.1`, orange
    cloud).
- **HSTS at the edge:** SSL/TLS > Edge Certificates > HSTS. Enable with a
  modest start (max-age 6 months, no preload), then raise it after the launch is
  stable. Also turn on **Always Use HTTPS** and keep the minimum TLS at 1.2.
  The Worker itself sends no HSTS header.
- **Email sending:** Compute > Email Service > Email Sending: onboard
  `notify.irishette.com` and add the SPF and DKIM records it shows. The app
  sends from `bookings@`, `admin@` and `auth@notify.irishette.com`
  (`src/lib/site.ts`). Wait until the domain shows as verified before step 8.
- **A real inbox for `bookings@irishette.com`:** it is the contact address on
  the legal pages, the reply-to of guest emails and the recipient of contact
  form messages. `notify.` has no inbox, so make sure this one receives mail.

## 6. Database migrations (you)

Applies `drizzle/0000` to `0005` to the **production** database
(`bfd93ead-...`). It changes live data, so run it deliberately:

```bash
pnpm exec cf d1 migrations list bfd93ead-44a5-4541-aba0-6cb72cde7336 --dir ./drizzle   # what is unapplied
pnpm db:migrate:remote                                                                 # apply (asks for confirmation)
```

Needs `pnpm exec cf auth login` once.

## 7. Dry run (you; asks for Touch ID)

```bash
pnpm deploy:dry
pnpm check:bundle   # secret names must not appear in client assets
```

This builds with the production values and fails fast if `.env.production` is
incomplete. Nothing is uploaded.

## 8. First deploy (you)

```bash
pnpm run deploy
```

Always `pnpm run deploy` (bare `pnpm deploy` is a pnpm built-in). Confirm:

```bash
curl -sI https://irishette.com/ | head -3        # 301 to https://www.irishette.com/
curl -sI https://www.irishette.com/ | head -3    # 200
curl -s  https://www.irishette.com/robots.txt
curl -s  https://www.irishette.com/sitemap.xml | head
```

## 9. First admin (you)

1. Sign up on https://www.irishette.com/auth/signup with the admin email
   (magic link).
2. Review, then run, the promotion against the **production** database. There
   is no `--local`, so this targets the remote database. `cf` has no
   `d1 execute`; `cf d1 raw` is the equivalent:

```bash
# Preview the request first (sends nothing):
pnpm exec cf d1 raw bfd93ead-44a5-4541-aba0-6cb72cde7336 --dry-run \
  --sql="UPDATE user SET role = 'admin' WHERE email = ?" --params admin@example.com

# Run it, then check the result:
pnpm exec cf d1 raw bfd93ead-44a5-4541-aba0-6cb72cde7336 \
  --sql="UPDATE user SET role = 'admin' WHERE email = ?" --params admin@example.com
pnpm exec cf d1 raw bfd93ead-44a5-4541-aba0-6cb72cde7336 \
  --sql="SELECT id, email, role FROM user WHERE email = ?" --params admin@example.com
```

Replace `admin@example.com` with the real address. Sign out and in again so the
session picks up the role; `/admin` then opens.

## 10. Configure the site in admin (you)

The database starts empty.

- Create the rooms (Rose Room and Texas Room, slugs `rose-room` and
  `texas-room`, the slugs the pages load), their pricing rules and any blocked
  dates.
- Add the iCal feeds (import) and connect the export URLs on the booking
  channels. The export feed URLs use `BETTER_AUTH_URL`.
- Check admin Settings (notification preferences) and the inbox.
- Cancellation policy: with no saved policy the code's
  `DEFAULT_CANCELLATION_POLICY` (`src/lib/booking/cancellation-policy.ts`) is
  the launch policy, and `/cancellation-refund-policy` shows it. Only edit it
  in admin if you want to change it.

## 11. Verify before announcing (you)

Use a small real booking: a temporary cheap room or pricing rule (Stripe's
minimum charge is $0.50) that you deactivate afterwards.

- [ ] Magic-link sign-in works (email arrives from `auth@notify.irishette.com`).
- [ ] Book, pay (card and Link), and see the confirmation page.
- [ ] Guest confirmation email and the admin new-booking email arrive.
- [ ] Stripe Dashboard > Webhooks > the live endpoint: deliveries are `200`.
- [ ] The charge was captured only after the booking was confirmed.
- [ ] Cancel the booking as the guest; the refund appears in Stripe and the
      refund email arrives.
- [ ] Contact form: submit with Turnstile; the message reaches the admin inbox
      and `bookings@irishette.com`.
- [ ] `/admin`, `/account`, `/auth/*` and `/api/*` are disallowed in
      `robots.txt`; the sitemap lists the public pages.
- [ ] Scheduled jobs ran (Workers > irishette > Logs after the next `:00` or
      `:30`).

## 12. Enforce the CSP (you, after step 11 is clean)

The site sends the Content Security Policy as **report-only**
(`Content-Security-Policy-Report-Only`). While you test booking, Stripe and
Link, auth and admin, watch the violation reports in Workers Logs:

```bash
pnpm tail          # live; or Workers > irishette > Observability, filter "/api/csp-report"
```

When a full pass of step 11 produces no unexpected reports, switch
`Content-Security-Policy-Report-Only` to `Content-Security-Policy` in
`src/lib/security/security-headers.ts` (and update the tests and the notes in
`docs/SECURE_AUTH_IMPLEMENTATION.md`), then redeploy. Tell the agent to make
that change.

## Troubleshooting

- **Build says `.env.production is incomplete`:** the message lists which of
  the three values is missing or still a dev value.
- **Stripe webhook returns 400/401:** the signing secret on the Worker does not
  belong to the live endpoint; re-run `wrangler secret put STRIPE_TRPC_WEBHOOK_SECRET`.
- **Sign-in or checkout redirects to the wrong host:** `BETTER_AUTH_URL` was
  built with a different value; fix `.env.production` and redeploy.
- **Roll back a bad deploy:** Workers > irishette > Deployments > pick the
  previous version > Rollback. Database changes are not rolled back.
