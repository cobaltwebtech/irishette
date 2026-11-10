# Hotel Occupancy Tax report (admin)

## Context

Irishette charges Texas state HOT (`room.stateTaxRate`, 6%) and City of Dublin HOT (`room.cityTaxRate`) on each booking (`priceStay` in `src/lib/pricing.ts`). Admins need to file these taxes, so they need a report of receipts and tax collected for any period (month, quarter, year, custom), printable, with CSV and PDF exports.

What exists today and why it is not enough:
- `bookings` stores only `baseAmount`, `feesAmount`, `taxAmount` (one total). The state/city split and the rates are **not stored**: `checkoutLineItems` (`src/lib/checkout-service.ts:128`) re-derives them from the room's *current* rates. If an admin changes a rate, past bookings can no longer be split correctly.
- The 12% service fee is not taxed. Texas generally treats mandatory room-related fees as taxable hotel receipts; you chose to tax it going forward.
- Note: hotel stays in Texas are subject to HOT, not the 8.25% sales tax, so the report covers state + city HOT only. Confirm the treatment with your CPA.

Decisions (from you): period = **payment date** (cash basis; refunds count in the period they are made); **HOT applies to room + service fee** from now on; PDF = **print view + browser Save as PDF**; exemptions **not tracked now** (an "Exempt receipts" line fixed at $0 keeps the layout aligned with the state/city returns).

## Git workflow

- Before any edits, create a new branch from `main`: `git switch -c feat/hot-tax-report` (approved by you with this plan).
- The working tree already has uncommitted changes (iCal, room validation, etc.) that are not part of this work. Never stage them: stage only this feature's files by explicit path (no `git add -A` / `git add .`). Where a file overlaps (`RoomPricingConfig.tsx`, `BookingSummaryCard.tsx` already modified), stage only this feature's hunks with `git add -p` or ask you first.
- Commit at the end of each phase below, only after `pnpm check` and the relevant tests pass for that phase. Commits are authored solely by your git identity: **no `Co-authored-by:` trailers, no "Generated with" lines, no AI attribution**.
- Do not push or open a PR unless you ask.

Phase commits (conventional messages):
1. `feat(db): snapshot hotel occupancy tax rates and amounts on bookings` (section 1: schema + generated migration)
2. `feat(pricing): apply hotel occupancy tax to room price and service fee` (section 2: pricing, booking-service, checkout line items, copy, pricing tests)
3. `feat(reports): add hotel occupancy tax report service and tRPC procedure` (section 3 + unit/workers tests + authz list)
4. `feat(admin): add hotel occupancy tax report page with CSV and print view` (section 4 + sidebar + print styles)
5. `docs: document hotel occupancy tax reporting` (section 5 docs, seed updates) — then run the full Verification workflow; fix-ups go in a final `chore: fix lint and review findings` commit if needed.

## 1. Snapshot tax on each booking (schema)

`src/db/booking-schema.ts`, add nullable columns (reals, dollars, like the existing ones):
`taxable_amount`, `state_tax_rate`, `city_tax_rate`, `state_tax_amount`, `city_tax_amount`.

- `pnpm drizzle-kit generate`, review SQL (plain `ALTER TABLE ADD COLUMN`), `pnpm db:migrate:local`. Remote migration only with your approval.
- No backfill migration. Rows with null snapshots (bookings before this change) are computed in the report from `baseAmount` + the room's current rates and marked **estimated** in the detail table and CSV.

## 2. Tax the service fee (pricing)

- `priceStay` (`src/lib/pricing.ts`): `taxableAmount = baseAmount + feesAmount`; state/city tax on that. `taxBreakdown` already carries `taxableAmount`.
- `createBooking` (`src/lib/booking-service.ts:211`): also write the five snapshot fields from `price.taxBreakdown`.
- `checkoutLineItems` (`src/lib/checkout-service.ts:128`): use the stored `stateTaxAmount`/`cityTaxAmount` when present; keep the current derivation only as the fallback for null rows (open holds created before deploy).
- Copy: `RoomPricingConfig.tsx` description ("calculated on room price only") and `BookingSummaryCard.tsx` breakdown labels.
- Update `test/unit` pricing tests for the new taxable base.

## 3. Report data (server)

- **`src/lib/tax-report.ts`** (shared zone, pure): types, `aggregateTaxReport(payments, refunds)` working in **integer cents**, period presets (`monthRange`, `quarterRange`, `yearRange` returning CT `YYYY-MM-DD` bounds), and `toCsv(rows)` with RFC 4180 quoting and spreadsheet formula-injection guarding (prefix `'` to cells starting with `= + - @`).
- **`src/lib/tax-report-service.ts`** (server zone; add to `.fallowrc.json` `server` boundary): `getTaxReport(deps, { from, to })`.
  - Period bounds: `from` 00:00 CT to the day after `to` 00:00 CT via `zonedTimeToUtc` (`src/lib/timezone.ts`).
  - **Payments**: `payment_transactions` with `createdAt` in range, joined to `bookings` (+ room name); one positive row each.
  - **Refunds**: `payment_refunds` with `status = 'succeeded'` and `stripeCreatedAt` in range, joined to `bookings`; one negative row each, split pro rata to the booking's mix (refund × base/total, fees/total, state tax/total, city tax/total; last component absorbs rounding cents). Refunds with no booking are listed but excluded from tax lines.
  - Disputes are not adjusted (noted in the report footer and docs).
- **Router** `src/integrations/trpc/reports.ts`: `adminTaxReport` = `adminProcedure`, Zod input `{ from, to }` (ISO dates, `from <= to`, max span ~2 years), schema in `src/lib/report-validation.ts`. Register in `router.ts`. Selects explicit columns.

Report output:
- **Summary** (mirrors the Texas Hotel Occupancy Tax return lines): Total receipts collected (incl. tax), Room revenue, Service fees, **Total hotel receipts (taxable sales, excl. tax)**, Exempt receipts ($0), **Taxable receipts**, State HOT, City HOT, Total HOT; each as gross payments, refunds, net.
- **By month** table (for quarter/year views).
- **Detail**: date (CT), type (payment/refund), confirmation ID (links to `/admin/bookings/$publicId`), guest name, room, stay dates, room, fees, taxable, state tax, city tax, total, estimated flag.

## 4. Admin page

- Route **`src/routes/_authed/_admin/admin/reports/tax.tsx`** (under the existing admin guard). `validateSearch` (Zod): `preset: 'month' | 'quarter' | 'year' | 'custom'`, `period` (e.g. `2026-11`, `2026-Q4`, `2026`), `from`/`to` for custom; defaults to the current month from `useTodayCT()`. Loader uses `ensureQueryData` with `trpc.reports.adminTaxReport.queryOptions`.
- Controls: preset tabs, period select / prev-next buttons, custom date range picker (reuse the existing day-picker + `toISODateString`/`parseISODateString`), buttons **Export CSV** and **Print / Save PDF** (`window.print()`).
- Summary cards + tables with existing shadcn `Card`/`Table` (detail via TanStack Table like `BookingsTable`/`data-table/`). Money via `src/lib/format.ts`, dates via `formatDateCT`/`formatStayDate`.
- CSV built client-side from loaded data (`toCsv`), downloaded as `hot-report_<from>_<to>.csv`: summary block, monthly block, detail rows.
- **Print**: `print:hidden` on sidebar/header/controls (`AdminLayout.tsx`, `AdminSidebar.tsx`), a print-only header (property name from `src/lib/site.ts`, period, "Generated <CT time>"), `break-inside-avoid` on tables, light colors.
- Sidebar: new "Reports" group → "Hotel Occupancy Tax" in `AdminSidebar.tsx`.

## 5. Tests and docs

- Unit (`test/unit/tax-report.test.ts`): aggregation in cents, pro-rata refunds and rounding, presets (quarter/year bounds, Dec→Jan), CSV quoting and formula guard; pricing tests updated.
- Workers (`test/workers/tax-report.test.ts`): seeded payments/refunds around a CT midnight period boundary, a legacy null-snapshot booking (estimated), unlinked refund. Add `reports.adminTaxReport` to `test/workers/trpc-authz.test.ts` (admin-only).
- Docs: new `docs/TAX_REPORTING.md` (basis, lines, refund allocation, estimated rows, disputes not adjusted, CPA note); update `TRPC_QUICK_REFERENCE.md`, `BOOKING_ARCHITECTURE.md` / `STRIPE_PAYMENT_INTEGRATION.md` (tax now on room + fee, snapshot columns), AGENTS.md architecture map (`reports` router, server zone entry).

## Verification

1. `pnpm check:fix` → `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` → `pnpm check:bundle`, Fallow (`doctor`, `audit --base main`, `architecture`).
2. `pnpm db:migrate:local`, `pnpm db:reset:local` if seed needs the new columns (update `scripts/seed-local.sql` to include snapshot values for some rows and leave some null).
3. Dev server (preview `name` from `.claude/launch.json`), sign in as local admin: open `/admin/reports/tax`, switch month/quarter/year/custom, check totals against the seeded rows, export CSV and open it, use Print preview (sidebar hidden, single clean report). Create a test-mode booking with Stripe test card and confirm the new tax lines in Checkout and in the report; issue a cancellation refund and confirm the negative row.

Note: the uncommitted changes already in the working tree (iCal, room validation, etc.) are left untouched.
