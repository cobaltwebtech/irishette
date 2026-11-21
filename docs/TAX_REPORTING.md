# Hotel Occupancy Tax reporting

Admin report of hotel receipts and Hotel Occupancy Tax (HOT) collected in a
period, for filing the Texas state return and the City of Dublin return.

- Page: `/admin/reports/tax` (`src/routes/_authed/_admin/admin/reports/tax.tsx`),
  sidebar "Reports" -> "Hotel Occupancy Tax".
- Procedure: `reports.adminTaxReport` (admin only), input
  `taxReportInputSchema` (`src/lib/reports/report-validation.ts`).
- Server: `getTaxReport` in `src/lib/reports/tax-report-service.ts`.
- Pure logic (aggregation, periods, CSV): `src/lib/reports/tax-report.ts`.

> The figures are bookkeeping aids. Confirm the tax treatment (what is
> taxable, exemptions, the filing basis) with your CPA before filing.

## What is taxed

- Hotel stays in Texas are subject to hotel occupancy tax, not sales tax. The
  report covers state HOT (`room.stateTaxRate`, 6%) and city HOT
  (`room.cityTaxRate`) only.
- **Tax applies to the room price plus the service fee** (`priceStay` in
  `src/lib/booking/pricing.ts`): `taxableAmount = baseAmount + feesAmount`; each tax
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
| Receipts not taxed | Only shown when not zero: money kept from cancelled nights below the full room rate (not taxable in Texas) and fees of bookings made before the fee was taxed |
| **Taxable receipts** | Total hotel receipts - exempt - fees not taxed |
| State hotel occupancy tax | |
| City hotel occupancy tax | |
| **Total hotel occupancy tax** | State + city |

The "By month" table (net of refunds) appears for quarter, year and custom
periods. The detail table lists every payment and refund with its booking
(linked to the admin booking page), guest, room and stay dates.

## Cancelled nights: when tax stays due (plan 06)

Texas rule (Comptroller quick reference for hotels, "Room Cancellation Fee",
Tex. Tax Code §156.051(a)): tax is due on money kept for a cancelled room
**only when the full room rate is kept and the cancellation is within 30
days of the stay**. Keeping a percentage of the rate is not taxable. The
site has no separate cancellation or change fee; the money it keeps under
the cancellation windows is treated this way:

| Situation | Refund | Kept | Tax on what is kept |
|---|---|---|---|
| Partial-refund window (e.g. 75%) | Tier % of room + fee, **plus all the tax** | The rest of room + fee | None |
| No refund, within 30 days of check-in (incl. late same-day) | Nothing | Everything | Stays due |
| No refund, more than 30 days out (only with a custom tier) | The tax only | Room + fee | None |
| Full refund | Everything | Nothing | None |

This applies to cancellations (`quoteBookingCancellation` ->
`policyRefundAmount`) and to changes that drop nights for less money
(`amountsAfterPolicyRefund`). Helpers: `src/lib/booking/tax-split.ts`
(`taxDueOnKept`, `policyRefundCents`, `refundSplitTaxFirst`). An admin's
explicit "full" refund returns everything; "none" keeps everything (as
taxed). Bookings without a tax snapshot keep the plain percentage.

## How each row is split

Every payment and app refund stores its room, fee, taxable receipts and
state / city tax when it is made (`payment_transactions` and
`payment_refunds`: `room_amount`, `fees_amount`, `taxable_amount`,
`state_tax_amount`, `city_tax_amount`; migration 0009):

- the checkout payment: the booking's snapshot;
- a change's extra charge: new minus old snapshot;
- a refund (cancellation or cheaper change): the tax first, then room and
  fee in proportion (`refundSplitTaxFirst`); once the tax is fully refunded
  its taxable receipts are too, so whatever is kept is untaxed. A refund
  spread over several payments divides the split by amount.

The report uses the stored split when there is one. Rows without one
(older rows, refunds made in the Stripe Dashboard, a change finished by the
recovery cron) are split **in the booking's own proportions**
(`amount * component / booking total`): fee and tax parts rounded, the room
part takes the remaining cents.

Money kept untaxed shows on the **Receipts not taxed** line (room + fees -
taxable receipts), together with the service fees of bookings made before
the fee was taxed.

Refunds that match no booking (for example a Dashboard refund of an unlinked
payment) are listed as "No booking" and reported on their own line, **not**
included in any total.

## Reservation changes (admin, plan 06)

A change updates the booking's tax snapshot to what the guest now owes, and
the money moves as ordinary report rows:

- **Extra charge** (longer or dearer stay): a second payment row on the day
  it was captured, adding its tax.
- **Refund** (cheaper stay): a refund row on the day Stripe made it (once
  `succeeded`), which **reduces the liability** in that period.
- **Fewer nights for less money**: the dropped nights are cancelled under
  the booking's policy and the rule above: the tax on them comes back in
  full with the tier's share of their room and fee; what is kept stays in
  the booking's room and fee, untaxed. With no refund within 30 days, the
  full rate and its tax are kept.
- **Release early** moves no money and changes no amounts (the full rate of
  the unused nights is kept within the stay: taxable).

A booking's net rows add up to its current snapshot: the tax still owed for
the stay. Tests: `test/workers/modifications.test.ts` ("cancellation windows
on fewer nights, and tax liability", "cancellations under the hotel tax
rule", "the tax report counts both payments"), `test/unit/tax-split.test.ts`.

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
- **Several payments per booking** (an admin change charged extra or
  refunded part, plan 06): each payment and refund row is split in the
  booking's current proportions. For one room the fee and taxes are fixed
  shares of the total, so this is exact; after a move to a room with other
  fee or tax rates, rows paid before the change are split at the new room's
  rates (approximate). A per-payment snapshot may come later.

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
