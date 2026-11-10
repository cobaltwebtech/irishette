// Hotel Occupancy Tax report: aggregation, period presets and CSV. Pure and
// client-safe (the admin page builds the CSV from the loaded report). All
// report money is in INTEGER CENTS; inputs come from D1 in dollars.
// See docs/TAX_REPORTING.md.

import { addDays, addMonths, type IsoDate } from './date-range';
import { dateInZone } from './timezone';

// --- Inputs (dollars, as stored) ----------------------------------------------

/** The booking a payment or refund belongs to, with its stored money mix. */
export interface TaxReportBooking {
	publicId: string;
	confirmationId: string;
	guestName: string;
	roomName: string;
	checkInDate: IsoDate;
	checkOutDate: IsoDate;
	baseAmount: number;
	feesAmount: number | null;
	taxAmount: number | null;
	/** Tax snapshot; null on bookings made before it was stored. */
	stateTaxAmount: number | null;
	cityTaxAmount: number | null;
	/** The room's CURRENT rates: only used to estimate rows with no snapshot. */
	roomStateTaxRate: number;
	roomCityTaxRate: number;
}

/** A payment or a succeeded refund (positive dollars). */
export interface TaxReportEntry {
	id: string;
	at: Date;
	amount: number;
	/** Null: a refund that matches no booking. */
	booking: TaxReportBooking | null;
}

// --- Output (cents) -----------------------------------------------------------

export interface TaxReportRow {
	id: string;
	type: 'payment' | 'refund';
	at: Date;
	/** Central Time calendar date of `at`. */
	date: IsoDate;
	bookingPublicId: string | null;
	confirmationId: string | null;
	guestName: string | null;
	roomName: string | null;
	checkInDate: IsoDate | null;
	checkOutDate: IsoDate | null;
	/** Signed cents: payments positive, refunds negative. */
	room: number;
	fees: number;
	taxable: number;
	stateTax: number;
	cityTax: number;
	total: number;
	/** No tax snapshot: split from the room's current rates. */
	estimated: boolean;
	/** False for a refund with no booking (left out of every total). */
	linked: boolean;
}

/** The report lines, in the order of the Texas HOT return. Cents. */
export interface TaxReportAmounts {
	/** Money collected, tax included. */
	total: number;
	room: number;
	fees: number;
	/** Room + service fees (taxable sales before tax). */
	receipts: number;
	/** Exemptions are not tracked: always 0. */
	exempt: number;
	/** Service fees of bookings made before the fee was taxed. */
	untaxedFees: number;
	taxable: number;
	stateTax: number;
	cityTax: number;
	totalTax: number;
}

export interface TaxReportTotals {
	payments: TaxReportAmounts;
	refunds: TaxReportAmounts;
	net: TaxReportAmounts;
}

export interface TaxReportMonth extends TaxReportTotals {
	/** `YYYY-MM` (Central Time). */
	month: string;
}

export interface TaxReport {
	from: IsoDate;
	to: IsoDate;
	summary: TaxReportTotals;
	months: TaxReportMonth[];
	rows: TaxReportRow[];
	/** Cents refunded with no matching booking (negative; not in the totals). */
	unlinkedRefunds: number;
	estimatedRows: number;
}

// --- Aggregation --------------------------------------------------------------

const toCents = (dollars: number | null | undefined) =>
	Math.round((dollars ?? 0) * 100);

interface Mix {
	room: number;
	fees: number;
	stateTax: number;
	cityTax: number;
	feesTaxed: boolean;
	estimated: boolean;
}

/** The booking's stored price as cents, with the state/city split. */
function bookingMix(b: TaxReportBooking): Mix {
	const room = toCents(b.baseAmount);
	const fees = toCents(b.feesAmount);
	if (b.stateTaxAmount != null && b.cityTaxAmount != null) {
		return {
			room,
			fees,
			stateTax: toCents(b.stateTaxAmount),
			cityTax: toCents(b.cityTaxAmount),
			feesTaxed: true,
			estimated: false,
		};
	}
	// No snapshot: the stored tax total is right, the split is estimated from
	// the room's current rates. These bookings were taxed on the room only.
	const tax = toCents(b.taxAmount);
	const rates = b.roomStateTaxRate + b.roomCityTaxRate;
	const stateTax =
		rates > 0 ? Math.round((tax * b.roomStateTaxRate) / rates) : 0;
	return {
		room,
		fees,
		stateTax,
		cityTax: tax - stateTax,
		feesTaxed: false,
		estimated: true,
	};
}

/**
 * Splits `amount` cents across the booking's mix in proportion. Fees and
 * taxes are rounded; the room takes the remaining cents, so the parts always
 * add up to `amount` and a rounding cent never becomes tax.
 */
function allocate(amount: number, mix: Mix) {
	const whole = mix.room + mix.fees + mix.stateTax + mix.cityTax;
	if (whole <= 0) return { room: amount, fees: 0, stateTax: 0, cityTax: 0 };
	const part = (component: number) => Math.round((amount * component) / whole);
	const fees = part(mix.fees);
	const stateTax = part(mix.stateTax);
	const cityTax = part(mix.cityTax);
	return { room: amount - fees - stateTax - cityTax, fees, stateTax, cityTax };
}

const NO_BOOKING = {
	bookingPublicId: null,
	confirmationId: null,
	guestName: null,
	roomName: null,
	checkInDate: null,
	checkOutDate: null,
};

const bookingFields = (b: TaxReportBooking) => ({
	bookingPublicId: b.publicId,
	confirmationId: b.confirmationId,
	guestName: b.guestName,
	roomName: b.roomName,
	checkInDate: b.checkInDate,
	checkOutDate: b.checkOutDate,
});

/** The row's money parts (unsigned cents); all zero without a booking. */
function rowParts(amount: number, mix: Mix | null) {
	if (!mix) return { room: 0, fees: 0, taxable: 0, stateTax: 0, cityTax: 0 };
	const parts = allocate(amount, mix);
	return {
		...parts,
		taxable: mix.feesTaxed ? parts.room + parts.fees : parts.room,
	};
}

function toRow(
	type: TaxReportRow['type'],
	entry: TaxReportEntry,
): TaxReportRow {
	// Adding 0 keeps -0 out of the rows.
	const signed = (cents: number) => (type === 'payment' ? cents : -cents) + 0;
	const amount = toCents(entry.amount);
	const mix = entry.booking ? bookingMix(entry.booking) : null;
	const parts = rowParts(amount, mix);
	return {
		id: entry.id,
		type,
		at: entry.at,
		date: dateInZone(entry.at),
		...(entry.booking ? bookingFields(entry.booking) : NO_BOOKING),
		room: signed(parts.room),
		fees: signed(parts.fees),
		taxable: signed(parts.taxable),
		stateTax: signed(parts.stateTax),
		cityTax: signed(parts.cityTax),
		total: signed(amount),
		estimated: mix?.estimated ?? false,
		linked: entry.booking !== null,
	};
}

const emptyAmounts = (): TaxReportAmounts => ({
	total: 0,
	room: 0,
	fees: 0,
	receipts: 0,
	exempt: 0,
	untaxedFees: 0,
	taxable: 0,
	stateTax: 0,
	cityTax: 0,
	totalTax: 0,
});

function addRow(a: TaxReportAmounts, row: TaxReportRow) {
	a.total += row.total;
	a.room += row.room;
	a.fees += row.fees;
	a.receipts += row.room + row.fees;
	a.untaxedFees += row.room + row.fees - row.taxable;
	a.taxable += row.taxable;
	a.stateTax += row.stateTax;
	a.cityTax += row.cityTax;
	a.totalTax += row.stateTax + row.cityTax;
}

const emptyTotals = (): TaxReportTotals => ({
	payments: emptyAmounts(),
	refunds: emptyAmounts(),
	net: emptyAmounts(),
});

function addToTotals(totals: TaxReportTotals, row: TaxReportRow) {
	addRow(row.type === 'payment' ? totals.payments : totals.refunds, row);
	addRow(totals.net, row);
}

/**
 * Builds the report from the period's payments and succeeded refunds. A
 * refund is split across room, fee and taxes in the booking's own
 * proportions. Refunds with no booking are listed but left out of the totals.
 */
export function aggregateTaxReport(
	range: { from: IsoDate; to: IsoDate },
	payments: TaxReportEntry[],
	refunds: TaxReportEntry[],
): TaxReport {
	const rows = [
		...payments.map((p) => toRow('payment', p)),
		...refunds.map((r) => toRow('refund', r)),
	].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));

	const summary = emptyTotals();
	const byMonth = new Map<string, TaxReportTotals>();
	let unlinkedRefunds = 0;
	for (const row of rows) {
		if (!row.linked) {
			unlinkedRefunds += row.total;
			continue;
		}
		addToTotals(summary, row);
		const month = row.date.slice(0, 7);
		let totals = byMonth.get(month);
		if (!totals) {
			totals = emptyTotals();
			byMonth.set(month, totals);
		}
		addToTotals(totals, row);
	}

	return {
		...range,
		summary,
		months: [...byMonth.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, totals]) => ({ month, ...totals })),
		rows,
		unlinkedRefunds,
		estimatedRows: rows.filter((r) => r.estimated).length,
	};
}

// --- Periods ------------------------------------------------------------------

export const taxReportPresets = ['month', 'quarter', 'year', 'custom'] as const;
export type TaxReportPreset = (typeof taxReportPresets)[number];
type PeriodPreset = Exclude<TaxReportPreset, 'custom'>;

export interface DateRange {
	from: IsoDate;
	to: IsoDate; // inclusive
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER = /^(\d{4})-Q([1-4])$/;
const YEAR = /^(\d{4})$/;

const monthSpan = (first: IsoDate, months: number): DateRange => ({
	from: first,
	to: addDays(addMonths(first, months), -1),
});

/** `2026-11` -> Nov 1 to Nov 30. */
export function monthRange(period: string): DateRange | null {
	return MONTH.test(period) ? monthSpan(`${period}-01`, 1) : null;
}

/** `2026-Q4` -> Oct 1 to Dec 31. */
export function quarterRange(period: string): DateRange | null {
	const match = QUARTER.exec(period);
	if (!match) return null;
	const month = String((Number(match[2]) - 1) * 3 + 1).padStart(2, '0');
	return monthSpan(`${match[1]}-${month}-01`, 3);
}

/** `2026` -> Jan 1 to Dec 31. */
export function yearRange(period: string): DateRange | null {
	return YEAR.test(period) ? monthSpan(`${period}-01-01`, 12) : null;
}

const RANGES: Record<PeriodPreset, (period: string) => DateRange | null> = {
	month: monthRange,
	quarter: quarterRange,
	year: yearRange,
};

/** The date range of a preset's period, or null if `period` does not fit it. */
export const periodRange = (preset: PeriodPreset, period: string) =>
	RANGES[preset](period);

/** The period of `preset` that contains `date`: `2026-11`, `2026-Q4`, `2026`. */
export function periodOf(preset: PeriodPreset, date: IsoDate): string {
	const year = date.slice(0, 4);
	if (preset === 'year') return year;
	if (preset === 'month') return date.slice(0, 7);
	return `${year}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}

const STEP_MONTHS: Record<PeriodPreset, number> = {
	month: 1,
	quarter: 3,
	year: 12,
};

/** The period `steps` before (negative) or after `period`. */
export function shiftPeriod(
	preset: PeriodPreset,
	period: string,
	steps: number,
): string {
	const range = periodRange(preset, period);
	if (!range) return period;
	return periodOf(preset, addMonths(range.from, steps * STEP_MONTHS[preset]));
}

const monthName = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
});

/** "November 2026" for `2026-11`. */
export const formatMonth = (month: string) =>
	monthName.format(new Date(`${month}-01T00:00:00Z`));

/** "November 2026", "Q4 2026", "2026". */
export function periodLabel(preset: PeriodPreset, period: string): string {
	if (preset === 'month') return formatMonth(period);
	if (preset === 'quarter') return `${period.slice(5)} ${period.slice(0, 4)}`;
	return period;
}

// --- CSV ----------------------------------------------------------------------

type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starts with
 * = + - @, tab or CR) gets a leading apostrophe; numbers are written as they
 * are (a negative amount is not a formula). RFC 4180 quoting.
 */
function csvCell(value: CsvCell): string {
	if (value == null) return '';
	if (typeof value === 'number') return String(value);
	const text = FORMULA_START.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV (CRLF line ends) with spreadsheet formula guarding. */
export function toCsv(rows: CsvCell[][]): string {
	return rows.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('');
}

/** Cents as a plain dollar number for CSV cells: -1234 -> -12.34. */
const dollars = (cents: number) => cents / 100;

/** Label and value of each report line, in return order. */
export const TAX_REPORT_LINES: ReadonlyArray<{
	key: keyof TaxReportAmounts;
	label: string;
	/** Shown in bold (the lines copied onto the return). */
	strong?: boolean;
	/** Only shown when it is not zero. */
	optional?: boolean;
}> = [
	{ key: 'total', label: 'Total receipts collected (incl. tax)' },
	{ key: 'room', label: 'Room revenue' },
	{ key: 'fees', label: 'Service fees' },
	{
		key: 'receipts',
		label: 'Total hotel receipts (excl. tax)',
		strong: true,
	},
	{ key: 'exempt', label: 'Exempt receipts' },
	{
		key: 'untaxedFees',
		label: 'Service fees not taxed (bookings before the fee was taxed)',
		optional: true,
	},
	{ key: 'taxable', label: 'Taxable receipts', strong: true },
	{ key: 'stateTax', label: 'State hotel occupancy tax' },
	{ key: 'cityTax', label: 'City hotel occupancy tax' },
	{ key: 'totalTax', label: 'Total hotel occupancy tax', strong: true },
];

/** The report lines to show: optional lines only when they have a value. */
export function visibleTaxReportLines(totals: TaxReportTotals) {
	return TAX_REPORT_LINES.filter(
		(line) =>
			!line.optional ||
			totals.payments[line.key] !== 0 ||
			totals.refunds[line.key] !== 0,
	);
}

/** The whole report as CSV rows: summary, by month, then every row. */
export function taxReportCsvRows(report: TaxReport): CsvCell[][] {
	const lines = visibleTaxReportLines(report.summary);
	const rows: CsvCell[][] = [
		['Hotel Occupancy Tax report'],
		['Period', report.from, report.to],
		['Basis', 'Payment date (US Central Time); refunds on the refund date'],
		[],
		['Summary', 'Payments', 'Refunds', 'Net'],
		...lines.map((line) => [
			line.label,
			dollars(report.summary.payments[line.key]),
			dollars(report.summary.refunds[line.key]),
			dollars(report.summary.net[line.key]),
		]),
	];
	if (report.unlinkedRefunds !== 0) {
		rows.push([
			'Refunds with no booking (not included above)',
			'',
			dollars(report.unlinkedRefunds),
		]);
	}
	rows.push(
		[],
		['Month', ...lines.map((line) => `${line.label} (net)`)],
		...report.months.map((m) => [
			m.month,
			...lines.map((line) => dollars(m.net[line.key])),
		]),
		[],
		[
			'Date (CT)',
			'Type',
			'Confirmation',
			'Guest',
			'Room',
			'Check-in',
			'Check-out',
			'Room revenue',
			'Service fee',
			'Taxable',
			'State tax',
			'City tax',
			'Total',
			'Estimated',
		],
		...report.rows.map((r) => [
			r.date,
			r.type,
			r.confirmationId ?? (r.linked ? '' : 'No booking'),
			r.guestName,
			r.roomName,
			r.checkInDate,
			r.checkOutDate,
			dollars(r.room),
			dollars(r.fees),
			dollars(r.taxable),
			dollars(r.stateTax),
			dollars(r.cityTax),
			dollars(r.total),
			r.estimated ? 'yes' : '',
		]),
	);
	return rows;
}
