import { describe, expect, it } from 'vite-plus/test';

import {
	resolveTaxReportSearch,
	taxReportInputSchema,
	taxReportSearchSchema,
} from '@/lib/reports/report-validation';
import {
	aggregateTaxReport,
	monthRange,
	periodLabel,
	periodOf,
	quarterRange,
	shiftPeriod,
	type TaxReportBooking,
	type TaxReportEntry,
	taxReportCsvRows,
	toCsv,
	yearRange,
} from '@/lib/reports/tax-report';

const RANGE = { from: '2030-11-01', to: '2030-11-30' };

/** $200 room + $24 fee, taxed 6% + 7% on $224 (snapshot stored). */
const booking = (
	overrides: Partial<TaxReportBooking> = {},
): TaxReportBooking => ({
	publicId: 'bookingpublic001',
	confirmationId: 'ABC123',
	guestName: 'Fixture Guest',
	roomName: 'Rose Room',
	checkInDate: '2030-11-10',
	checkOutDate: '2030-11-12',
	baseAmount: 200,
	feesAmount: 24,
	taxAmount: 29.12,
	stateTaxAmount: 13.44,
	cityTaxAmount: 15.68,
	roomStateTaxRate: 0.06,
	roomCityTaxRate: 0.07,
	...overrides,
});

/** A booking made before the snapshot: taxed on the room only, no split. */
const legacy = () =>
	booking({
		confirmationId: 'OLD001',
		taxAmount: 26,
		stateTaxAmount: null,
		cityTaxAmount: null,
	});

const entry = (
	id: string,
	amount: number,
	at: string,
	b: TaxReportBooking | null = booking(),
): TaxReportEntry => ({ id, amount, at: new Date(at), booking: b });

const NOON = '2030-11-15T18:00:00Z';

describe('aggregateTaxReport', () => {
	it('reports a payment with the stored split, in cents', () => {
		const report = aggregateTaxReport(RANGE, [entry('p1', 253.12, NOON)], []);
		expect(report.rows[0]).toMatchObject({
			type: 'payment',
			date: '2030-11-15',
			confirmationId: 'ABC123',
			room: 20000,
			fees: 2400,
			taxable: 22400,
			stateTax: 1344,
			cityTax: 1568,
			total: 25312,
			estimated: false,
			linked: true,
		});
		expect(report.summary.net).toEqual({
			total: 25312,
			room: 20000,
			fees: 2400,
			receipts: 22400,
			exempt: 0,
			untaxedFees: 0,
			taxable: 22400,
			stateTax: 1344,
			cityTax: 1568,
			totalTax: 2912,
		});
		expect(report.summary.refunds.total).toBe(0);
		expect(report.estimatedRows).toBe(0);
	});

	it('splits a refund in the booking’s proportions, as negatives', () => {
		const report = aggregateTaxReport(
			RANGE,
			[entry('p1', 253.12, NOON)],
			[entry('r1', 126.56, '2030-11-20T18:00:00Z')],
		);
		expect(report.rows[1]).toMatchObject({
			type: 'refund',
			room: -10000,
			fees: -1200,
			taxable: -11200,
			stateTax: -672,
			cityTax: -784,
			total: -12656,
		});
		expect(report.summary.payments.totalTax).toBe(2912);
		expect(report.summary.refunds.totalTax).toBe(-1456);
		expect(report.summary.net).toMatchObject({
			total: 12656,
			taxable: 11200,
			stateTax: 672,
			cityTax: 784,
			totalTax: 1456,
		});
	});

	it('keeps an uneven refund exact: the room takes the rounding cents', () => {
		const [row] = aggregateTaxReport(RANGE, [], [entry('r1', 100, NOON)]).rows;
		expect(row).toMatchObject({
			fees: -948,
			stateTax: -531,
			cityTax: -619,
			room: -7902,
			total: -10000,
		});
		expect(row.room + row.fees + row.stateTax + row.cityTax).toBe(row.total);
	});

	it('a full refund cancels the payment exactly', () => {
		const report = aggregateTaxReport(
			RANGE,
			[entry('p1', 253.12, NOON)],
			[entry('r1', 253.12, '2030-11-16T18:00:00Z')],
		);
		expect(Object.values(report.summary.net).every((v) => v === 0)).toBe(true);
	});

	it('estimates the split of a booking with no snapshot', () => {
		const report = aggregateTaxReport(
			RANGE,
			[entry('p1', 250, NOON, legacy())],
			[],
		);
		expect(report.rows[0]).toMatchObject({
			room: 20000,
			fees: 2400,
			// Taxed on the room only.
			taxable: 20000,
			stateTax: 1200,
			cityTax: 1400,
			total: 25000,
			estimated: true,
		});
		expect(report.summary.net).toMatchObject({
			receipts: 22400,
			untaxedFees: 2400,
			taxable: 20000,
			totalTax: 2600,
		});
		expect(report.estimatedRows).toBe(1);
	});

	it('keeps the stored tax total when the room now has no tax rates', () => {
		const [row] = aggregateTaxReport(
			RANGE,
			[
				entry('p1', 250, NOON, {
					...legacy(),
					roomStateTaxRate: 0,
					roomCityTaxRate: 0,
				}),
			],
			[],
		).rows;
		expect(row.stateTax + row.cityTax).toBe(2600);
	});

	it('lists a refund with no booking but leaves it out of the totals', () => {
		const report = aggregateTaxReport(RANGE, [], [entry('r1', 40, NOON, null)]);
		expect(report.rows[0]).toMatchObject({
			type: 'refund',
			linked: false,
			confirmationId: null,
			total: -4000,
			room: 0,
			stateTax: 0,
		});
		expect(report.unlinkedRefunds).toBe(-4000);
		expect(report.summary.net.total).toBe(0);
		expect(report.months).toEqual([]);
	});

	it('groups by Central Time month and sorts rows by time', () => {
		const report = aggregateTaxReport(
			{ from: '2030-11-01', to: '2030-12-31' },
			[
				// 05:30 UTC on Dec 1 is still Nov 30 in Central Time.
				entry('p2', 253.12, '2030-12-01T05:30:00Z'),
				entry('p3', 253.12, '2030-12-01T06:30:00Z'),
				entry('p1', 253.12, NOON),
			],
			[entry('r1', 253.12, '2030-12-02T18:00:00Z')],
		);
		expect(report.rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'r1']);
		expect(report.rows.map((r) => r.date)).toEqual([
			'2030-11-15',
			'2030-11-30',
			'2030-12-01',
			'2030-12-02',
		]);
		expect(report.months.map((m) => [m.month, m.net.total])).toEqual([
			['2030-11', 50624],
			['2030-12', 0],
		]);
		expect(report.months[1].payments.total).toBe(25312);
		expect(report.months[1].refunds.total).toBe(-25312);
	});
});

describe('periods', () => {
	it('month, quarter and year ranges', () => {
		expect(monthRange('2030-11')).toEqual({
			from: '2030-11-01',
			to: '2030-11-30',
		});
		expect(monthRange('2032-02')?.to).toBe('2032-02-29');
		expect(quarterRange('2030-Q1')).toEqual({
			from: '2030-01-01',
			to: '2030-03-31',
		});
		expect(quarterRange('2030-Q4')).toEqual({
			from: '2030-10-01',
			to: '2030-12-31',
		});
		expect(yearRange('2030')).toEqual({
			from: '2030-01-01',
			to: '2030-12-31',
		});
	});

	it('rejects periods that do not fit the preset', () => {
		expect(monthRange('2030-13')).toBeNull();
		expect(monthRange('2030')).toBeNull();
		expect(quarterRange('2030-Q5')).toBeNull();
		expect(yearRange('2030-11')).toBeNull();
	});

	it('finds the period of a date', () => {
		expect(periodOf('month', '2030-11-09')).toBe('2030-11');
		expect(periodOf('quarter', '2030-11-09')).toBe('2030-Q4');
		expect(periodOf('quarter', '2030-03-31')).toBe('2030-Q1');
		expect(periodOf('year', '2030-11-09')).toBe('2030');
	});

	it('steps across the year end', () => {
		expect(shiftPeriod('month', '2030-12', 1)).toBe('2031-01');
		expect(shiftPeriod('month', '2031-01', -1)).toBe('2030-12');
		expect(shiftPeriod('quarter', '2030-Q4', 1)).toBe('2031-Q1');
		expect(shiftPeriod('quarter', '2031-Q1', -1)).toBe('2030-Q4');
		expect(shiftPeriod('year', '2030', -1)).toBe('2029');
	});

	it('labels periods', () => {
		expect(periodLabel('month', '2030-11')).toBe('November 2030');
		expect(periodLabel('quarter', '2030-Q4')).toBe('Q4 2030');
		expect(periodLabel('year', '2030')).toBe('2030');
	});
});

describe('taxReportInputSchema', () => {
	const ok = (from: string, to: string) =>
		taxReportInputSchema.safeParse({ from, to }).success;

	it('accepts a day, a month and two full years', () => {
		expect(ok('2030-11-09', '2030-11-09')).toBe(true);
		expect(ok('2030-11-01', '2030-11-30')).toBe(true);
		expect(ok('2029-01-01', '2030-12-31')).toBe(true);
	});

	it('rejects reversed, too long and invalid ranges', () => {
		expect(ok('2030-11-30', '2030-11-01')).toBe(false);
		expect(ok('2029-01-01', '2031-01-01')).toBe(false);
		expect(ok('2030-02-30', '2030-03-01')).toBe(false);
		expect(ok('11/01/2030', '2030-11-30')).toBe(false);
	});
});

describe('resolveTaxReportSearch', () => {
	const TODAY = '2030-11-09';
	const resolve = (search: Record<string, unknown>) =>
		resolveTaxReportSearch(taxReportSearchSchema.parse(search), TODAY);

	it('defaults to the current month', () => {
		expect(resolve({})).toEqual({
			preset: 'month',
			period: '2030-11',
			range: { from: '2030-11-01', to: '2030-11-30' },
		});
	});

	it('uses the asked period, or the current one if it does not fit', () => {
		expect(resolve({ preset: 'quarter', period: '2030-Q1' }).range).toEqual({
			from: '2030-01-01',
			to: '2030-03-31',
		});
		expect(resolve({ preset: 'quarter', period: '2030-11' })).toMatchObject({
			period: '2030-Q4',
			range: { from: '2030-10-01', to: '2030-12-31' },
		});
		expect(resolve({ preset: 'year' }).period).toBe('2030');
		expect(resolve({ preset: 'nope', period: 42 }).period).toBe('2030-11');
	});

	it('custom: the asked range, or the current month if it is invalid', () => {
		expect(
			resolve({ preset: 'custom', from: '2030-03-15', to: '2030-04-14' }),
		).toEqual({
			preset: 'custom',
			period: null,
			range: { from: '2030-03-15', to: '2030-04-14' },
		});
		for (const search of [
			{ preset: 'custom' },
			{ preset: 'custom', from: '2030-04-14', to: '2030-03-15' },
			{ preset: 'custom', from: '2030-02-31', to: '2030-03-15' },
			{ preset: 'custom', from: '2020-01-01', to: '2030-03-15' },
		]) {
			expect(resolve(search).range).toEqual({
				from: '2030-11-01',
				to: '2030-11-30',
			});
		}
	});
});

describe('toCsv', () => {
	it('quotes commas, quotes and line breaks (RFC 4180)', () => {
		expect(toCsv([['a,b', 'say "hi"', 'two\nlines', 'plain']])).toBe(
			'"a,b","say ""hi""","two\nlines",plain\r\n',
		);
	});

	it('guards text a spreadsheet would run as a formula', () => {
		expect(toCsv([['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '=1,2']])).toBe(
			`'=SUM(A1),'+1,'-2,'@cmd,'\tx,"'=1,2"\r\n`,
		);
	});

	it('writes numbers as they are, negatives included, and blanks for null', () => {
		expect(toCsv([[-12.34, 0, null, undefined, 5]])).toBe('-12.34,0,,,5\r\n');
	});
});

describe('taxReportCsvRows', () => {
	const report = aggregateTaxReport(
		RANGE,
		[
			entry('p1', 253.12, NOON, booking({ guestName: '=HYPERLINK("x")' })),
			entry('p2', 250, NOON, legacy()),
		],
		[entry('r1', 40, '2030-11-20T18:00:00Z', null)],
	);
	const rows = taxReportCsvRows(report);
	const line = (label: string) => rows.find((r) => r[0] === label);

	it('has the summary in dollars', () => {
		expect(line('Taxable receipts')).toEqual(['Taxable receipts', 424, 0, 424]);
		expect(line('Total hotel occupancy tax')?.[3]).toBe(55.12);
		expect(line('Refunds with no booking (not included above)')?.[2]).toBe(-40);
	});

	it('has one line per month and per row', () => {
		expect(line('2030-11')?.[1]).toBe(503.12);
		const detail = rows.filter((r) => r[1] === 'payment' || r[1] === 'refund');
		expect(detail).toHaveLength(3);
		expect(detail.map((r) => r.at(-1))).toEqual(['', 'yes', '']);
		expect(detail[2][2]).toBe('No booking');
	});

	it('guards guest names in the output', () => {
		expect(toCsv(rows)).toContain(`"'=HYPERLINK(""x"")"`);
	});
});
