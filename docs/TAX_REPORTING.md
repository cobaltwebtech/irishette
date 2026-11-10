# Hotel Occupancy Tax reporting

Admin report of hotel receipts and Hotel Occupancy Tax (HOT) collected in a
period, for filing the Texas state return and the City of Dublin return.

- Page: `/admin/reports/tax` (`src/routes/_authed/_admin/admin/reports/tax.tsx`),
  sidebar "Reports" -> "Hotel Occupancy Tax".
- Procedure: `reports.adminTaxReport` (admin only), input
  `taxReportInputSchema` (`src/lib/report-validation.ts`).
- Server: `getTaxReport` in `src/lib/tax-report-service.ts`.
- Pure logic (aggregation, periods, CSV): `src/lib/tax-report.ts`.

> The figures are bookkeeping aids. Confirm the tax treatment (what is
> taxable, exemptions, the filing basis) with your CPA before filing.

## What is taxed

- Hotel stays in Texas are subject to hotel occupancy tax, not sales tax. The
  report covers state HOT (`room.stateTaxRate`, 6%) and city HOT
  (`room.cityTaxRate`) only.
- **Tax applies to the room price plus the service fee** (`priceStay` in
  `src/lib/pricing.ts`): `taxableAmount = baseAmount + feesAmount`; each tax
  is `taxableAmount * rate`, rounded to cents.
- Bookings created before this rule were taxed on the room price only. Their
  stored totals are not changed.

## Tax snapshot on each booking

`createBooking` stores what was charged, so a later rate change never alters
past bookings:

| Column (`bookings`) | Meaning |
|---|---|
| `taxable_amount` | Room price + service fee (dollars) |
| `state_tax_rate`, `city_tax_rate` | Rates applied (fractions) |
| `state_tax_amount`, `city_tax_amount` | Tax charged (dollars); they add up to `tax_amount` |

All five are nullable. They are null on bookings made before the columns
existed (there is no backfill). Checkout line items (`checkoutLineItems`) use
the stored split and fall back to the room's rates only for those rows.

## Basis: payment date (cash)

- A **payment** counts on the day it was taken:
  `payment_transactions.created_at`.
- A **refund** counts on the day Stripe made it:
  `payment_refunds.stripe_created_at`, only when `status = 'succeeded'`. It is
  a negative row in the period of the refund, not of the original payment.
- Periods are **US Central Time** days: from `from` 00:00 CT up to (not
  including) the day after `to` 00:00 CT. Daylight saving changes are handled
  by `zonedTimeToUtc`.
- The stay dates do not matter: a December stay paid in November is reported
  in November.
- A period is at most 24 months.

## Report lines

Each line is shown as payments, refunds and net. Amounts are computed in
integer cents.

| Line | Value |
|---|---|
| Total receipts collected (incl. tax) | Money taken or refunded |
| Room revenue | Room price part |
| Service fees | Service fee part |
| **Total hotel receipts (excl. tax)** | Room revenue + service fees |
| Exempt receipts | Always $0.00: exemptions are not tracked |
| Service fees not taxed | Only shown when not zero: fees of bookings made before the fee was taxed |
| **Taxable receipts** | Total hotel receipts - exempt - fees not taxed |
| State hotel occupancy tax | |
| City hotel occupancy tax | |
| **Total hotel occupancy tax** | State + city |

The "By month" table (net of refunds) appears for quarter, year and custom
periods. The detail table lists every payment and refund with its booking
(linked to the admin booking page), guest, room and stay dates.

## Refund allocation

A refund is split across room, service fee, state tax and city tax **in the
booking's own proportions** (`refund * component / booking total`). The fee
and tax parts are rounded to cents and the room part takes the remaining
cents, so the parts always add up to the refund and a rounding cent never
becomes tax. A full refund cancels the payment exactly.

Refunds that match no booking (for example a Dashboard refund of an unlinked
payment) are listed as "No booking" and reported on their own line, **not**
included in any total.

## Estimated rows

A booking with no tax snapshot is marked **Estimated** (page and CSV):

- its tax total (`tax_amount`) is the stored, exact amount;
- the state/city split is that total divided in the proportion of the room's
  **current** rates, so it is wrong only if the rates changed since;
- its taxable receipts are the room price only (the fee was not taxed).

## Not adjusted

- **Disputes (chargebacks)** are not adjusted. Check the Stripe Dashboard and
  the admin inbox for the period.
- **Exemptions** (permanent residents, exempt organizations) are not tracked.
- Payments are assumed to be the booking total (one payment per booking).

## Exports

- **CSV** (`hot-report_<from>_<to>.csv`): built in the browser from the loaded
  report (`taxReportCsvRows` + `toCsv`): summary, monthly and detail blocks.
  Amounts are plain dollar numbers. RFC 4180 quoting; text cells that start
  with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe (spreadsheet
  formula injection).
- **PDF**: "Print / Save PDF" opens the browser print dialog; choose "Save as
  PDF". The print view hides the sidebar, header and controls
  (`print:hidden`, and the `@media print` rule in `src/styles/styles.css`) and
  adds a header with the property name, the period and the generation time.

## Search params

`taxReportSearchSchema`: `preset` (`month` default, `quarter`, `year`,
`custom`), `period` (`2026-11`, `2026-Q4`, `2026`), `from` / `to` (custom).
Invalid values fall back to the current period (`resolveTaxReportSearch`).

## Tests and local data

- `test/unit/tax-report.test.ts`: aggregation, refund rounding, estimates,
  periods, search params, CSV.
- `test/workers/tax-report.test.ts`: the procedure against D1, Central Time
  period boundaries, refund statuses, access.
- `pnpm db:seed:local` adds a synthetic guest with four paid bookings in
  October and November 2026 (one without a snapshot), a 50% refund and an
  unlinked refund.
