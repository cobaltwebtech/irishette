import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useId, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/integrations/trpc/react';
import { formatMoney } from '@/lib/format';
import {
	resolveTaxReportSearch,
	TAX_REPORT_MAX_MONTHS,
	type TaxReportSelection,
	taxReportInputSchema,
	taxReportSearchSchema,
} from '@/lib/report-validation';
import { SITE_NAME } from '@/lib/site';
import {
	formatMonth,
	periodLabel,
	periodOf,
	shiftPeriod,
	type TaxReport,
	type TaxReportAmounts,
	type TaxReportPreset,
	type TaxReportRow,
	taxReportCsvRows,
	toCsv,
	visibleTaxReportLines,
} from '@/lib/tax-report';
import { formatDateTimeCT, formatStayDate, todayIn } from '@/lib/timezone';
import { cn } from '@/utils/twMerge';
import { useNow, useTodayCT } from '@/utils/use-now';

export const Route = createFileRoute('/_authed/_admin/admin/reports/tax')({
	head: () => ({
		meta: [{ title: 'Hotel Occupancy Tax | Irishette.com' }],
	}),
	validateSearch: taxReportSearchSchema,
	loaderDeps: ({ search }) => search,
	// Auth: the _admin layout. The report is preloaded for SSR.
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(
			context.trpc.reports.adminTaxReport.queryOptions(
				resolveTaxReportSearch(deps, todayIn()).range,
			),
		),
	component: TaxReportPage,
});

const PRESETS: Array<{ value: TaxReportPreset; label: string }> = [
	{ value: 'month', label: 'Month' },
	{ value: 'quarter', label: 'Quarter' },
	{ value: 'year', label: 'Year' },
	{ value: 'custom', label: 'Custom' },
];

/** Cents as "$1,234.56" (refunds show as negative amounts). */
const money = (cents: number) => formatMoney(cents / 100);

const NUMERIC = 'text-right tabular-nums';

function selectionLabel({ preset, period, range }: TaxReportSelection) {
	if (preset !== 'custom' && period) return periodLabel(preset, period);
	return `${formatStayDate(range.from)} to ${formatStayDate(range.to)}`;
}

/** Saves the report as a CSV file (UTF-8 with BOM, so Excel reads accents). */
function downloadCsv(report: TaxReport) {
	const blob = new Blob([`﻿${toCsv(taxReportCsvRows(report))}`], {
		type: 'text/csv;charset=utf-8',
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `hot-report_${report.from}_${report.to}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}

function TaxReportPage() {
	const trpc = useTRPC();
	const today = useTodayCT();
	const now = useNow();
	const selection = resolveTaxReportSearch(Route.useSearch(), today);
	const { data: report } = useSuspenseQuery(
		trpc.reports.adminTaxReport.queryOptions(selection.range),
	);
	const label = selectionLabel(selection);
	const { net } = report.summary;

	return (
		<AdminLayout title="Hotel Occupancy Tax">
			{/* Printed pages start here: the screen header is hidden. */}
			<div className="hidden print:block">
				<p className="text-xl font-bold">
					{SITE_NAME}: Hotel Occupancy Tax report
				</p>
				<p className="text-sm">
					{label} ({formatStayDate(report.from)} to {formatStayDate(report.to)}
					), by payment date, US Central Time
				</p>
				<p className="text-xs">Generated {formatDateTimeCT(now)}</p>
			</div>

			<ReportControls
				selection={selection}
				today={today}
				label={label}
				onExport={() => downloadCsv(report)}
			/>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
				<StatCard label="Taxable receipts" value={net.taxable} />
				<StatCard label="State HOT" value={net.stateTax} />
				<StatCard label="City HOT" value={net.cityTax} />
				<StatCard label="Total HOT due" value={net.totalTax} strong />
			</div>

			<SummaryCard report={report} label={label} />
			{(report.months.length > 1 || selection.preset !== 'month') &&
				report.months.length > 0 && <MonthsCard report={report} />}
			<DetailCard report={report} />

			<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground print:text-xs">
				<li>
					Cash basis: a payment counts on the day it was taken and a refund on
					the day it was made (US Central Time). A refund is split across room,
					service fee and taxes in the booking's own proportions.
				</li>
				<li>
					Hotel occupancy tax applies to the room price plus the service fee.
					Exemptions are not tracked, so exempt receipts are always $0.00.
				</li>
				{report.estimatedRows > 0 && (
					<li>
						Rows marked "Estimated" are bookings made before tax amounts were
						stored per booking: their tax total is exact, but the state/city
						split uses the room's current rates.
					</li>
				)}
				<li>
					Disputes (chargebacks) are not adjusted here; see the Stripe
					Dashboard. Confirm the figures and their treatment with your CPA
					before filing.
				</li>
			</ul>
		</AdminLayout>
	);
}

function ReportControls({
	selection,
	today,
	label,
	onExport,
}: {
	selection: TaxReportSelection;
	today: string;
	label: string;
	onExport: () => void;
}) {
	const { preset, period } = selection;
	return (
		<Card className="print:hidden">
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<nav aria-label="Report period type" className="flex flex-wrap gap-2">
						{PRESETS.map((p) => (
							<Link
								key={p.value}
								from={Route.fullPath}
								search={{ preset: p.value }}
								aria-current={p.value === preset ? 'page' : undefined}
								className={buttonVariants({
									variant: p.value === preset ? 'default' : 'outline',
									size: 'sm',
								})}
							>
								{p.label}
							</Link>
						))}
					</nav>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={onExport}>
							<Icon icon="tabler:file-type-csv" />
							Export CSV
						</Button>
						<Button variant="outline" size="sm" onClick={() => window.print()}>
							<Icon icon="tabler:printer" />
							Print / Save PDF
						</Button>
					</div>
				</div>

				{preset !== 'custom' && period ? (
					<div className="flex items-center gap-2">
						<Link
							from={Route.fullPath}
							search={{ preset, period: shiftPeriod(preset, period, -1) }}
							aria-label="Previous period"
							className={buttonVariants({ variant: 'outline', size: 'icon' })}
						>
							<Icon icon="tabler:chevron-left" />
						</Link>
						<p
							className="min-w-40 text-center text-lg font-semibold"
							aria-live="polite"
						>
							{label}
						</p>
						<Link
							from={Route.fullPath}
							search={{ preset, period: shiftPeriod(preset, period, 1) }}
							// Nothing to report after the current period.
							disabled={period >= periodOf(preset, today)}
							aria-label="Next period"
							className={cn(
								buttonVariants({ variant: 'outline', size: 'icon' }),
								'aria-disabled:pointer-events-none aria-disabled:opacity-50',
							)}
						>
							<Icon icon="tabler:chevron-right" />
						</Link>
					</div>
				) : (
					// Remount when the range changes so the inputs show the new dates.
					<CustomRangeForm
						key={`${selection.range.from}_${selection.range.to}`}
						selection={selection}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function CustomRangeForm({ selection }: { selection: TaxReportSelection }) {
	const navigate = Route.useNavigate();
	const fromId = useId();
	const toId = useId();
	const errorId = useId();
	const [error, setError] = useState<string | null>(null);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const parsed = taxReportInputSchema.safeParse({
			from: form.get('from'),
			to: form.get('to'),
		});
		if (!parsed.success) {
			setError(
				parsed.error.issues[0]?.message ??
					`Choose a range of at most ${TAX_REPORT_MAX_MONTHS} months`,
			);
			return;
		}
		setError(null);
		void navigate({ search: { preset: 'custom', ...parsed.data } });
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-2">
			<div className="flex flex-wrap items-end gap-3">
				<div>
					<Label htmlFor={fromId} className="mb-1 text-sm">
						From
					</Label>
					<Input
						id={fromId}
						name="from"
						type="date"
						required
						defaultValue={selection.range.from}
						aria-describedby={error ? errorId : undefined}
					/>
				</div>
				<div>
					<Label htmlFor={toId} className="mb-1 text-sm">
						To (inclusive)
					</Label>
					<Input
						id={toId}
						name="to"
						type="date"
						required
						defaultValue={selection.range.to}
						aria-describedby={error ? errorId : undefined}
					/>
				</div>
				<Button type="submit" size="sm">
					Show report
				</Button>
			</div>
			{error && (
				<p id={errorId} role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</form>
	);
}

function StatCard({
	label,
	value,
	strong,
}: {
	label: string;
	value: number;
	strong?: boolean;
}) {
	return (
		<Card className="break-inside-avoid print:gap-1 print:py-3 print:shadow-none">
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle
					className={cn('text-2xl tabular-nums', strong && 'text-primary')}
				>
					{money(value)}
				</CardTitle>
			</CardHeader>
		</Card>
	);
}

const PRINT_CARD = 'print:border-0 print:py-0 print:shadow-none';
const PRINT_CARD_INNER = 'print:px-0';

function SummaryCard({ report, label }: { report: TaxReport; label: string }) {
	const { payments, refunds, net } = report.summary;
	return (
		<Card className={PRINT_CARD}>
			<CardHeader className={PRINT_CARD_INNER}>
				<CardTitle>Summary: {label}</CardTitle>
				<CardDescription>
					{formatStayDate(report.from)} to {formatStayDate(report.to)}. Lines
					follow the Texas hotel occupancy tax return.
				</CardDescription>
			</CardHeader>
			<CardContent className={PRINT_CARD_INNER}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Line</TableHead>
							<TableHead className={NUMERIC}>Payments</TableHead>
							<TableHead className={NUMERIC}>Refunds</TableHead>
							<TableHead className={NUMERIC}>Net</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleTaxReportLines(report.summary).map((line) => (
							<TableRow
								key={line.key}
								className={cn(
									'break-inside-avoid',
									line.strong && 'font-semibold',
								)}
							>
								<TableCell className="whitespace-normal">
									{line.label}
								</TableCell>
								<TableCell className={NUMERIC}>
									{money(payments[line.key])}
								</TableCell>
								<TableCell className={NUMERIC}>
									{money(refunds[line.key])}
								</TableCell>
								<TableCell className={NUMERIC}>
									{money(net[line.key])}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				{report.unlinkedRefunds !== 0 && (
					<p className="mt-3 text-sm text-muted-foreground">
						Not included above: {money(report.unlinkedRefunds)} refunded with no
						matching booking (listed below as "No booking").
					</p>
				)}
			</CardContent>
		</Card>
	);
}

const MONTH_COLUMNS: Array<{ key: keyof TaxReportAmounts; label: string }> = [
	{ key: 'receipts', label: 'Hotel receipts' },
	{ key: 'taxable', label: 'Taxable' },
	{ key: 'stateTax', label: 'State HOT' },
	{ key: 'cityTax', label: 'City HOT' },
	{ key: 'totalTax', label: 'Total HOT' },
	{ key: 'total', label: 'Collected' },
];

function MonthsCard({ report }: { report: TaxReport }) {
	return (
		<Card className={PRINT_CARD}>
			<CardHeader className={PRINT_CARD_INNER}>
				<CardTitle>By month</CardTitle>
				<CardDescription>Net of refunds.</CardDescription>
			</CardHeader>
			<CardContent className={PRINT_CARD_INNER}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Month</TableHead>
							{MONTH_COLUMNS.map((c) => (
								<TableHead key={c.key} className={NUMERIC}>
									{c.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{report.months.map((m) => (
							<TableRow key={m.month} className="break-inside-avoid">
								<TableCell>{formatMonth(m.month)}</TableCell>
								{MONTH_COLUMNS.map((c) => (
									<TableCell key={c.key} className={NUMERIC}>
										{money(m.net[c.key])}
									</TableCell>
								))}
							</TableRow>
						))}
						<TableRow className="break-inside-avoid font-semibold">
							<TableCell>Total</TableCell>
							{MONTH_COLUMNS.map((c) => (
								<TableCell key={c.key} className={NUMERIC}>
									{money(report.summary.net[c.key])}
								</TableCell>
							))}
						</TableRow>
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

const DETAIL_AMOUNTS: Array<{
	key: 'room' | 'fees' | 'taxable' | 'stateTax' | 'cityTax' | 'total';
	label: string;
}> = [
	{ key: 'room', label: 'Room' },
	{ key: 'fees', label: 'Fee' },
	{ key: 'taxable', label: 'Taxable' },
	{ key: 'stateTax', label: 'State' },
	{ key: 'cityTax', label: 'City' },
	{ key: 'total', label: 'Total' },
];

function DetailCard({ report }: { report: TaxReport }) {
	return (
		<Card className={PRINT_CARD}>
			<CardHeader className={PRINT_CARD_INNER}>
				<CardTitle>Payments and refunds</CardTitle>
				<CardDescription>
					{report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'}, by
					date (Central Time).
				</CardDescription>
			</CardHeader>
			<CardContent className={PRINT_CARD_INNER}>
				{report.rows.length === 0 ? (
					<p className="py-6 text-center text-muted-foreground">
						No payments or refunds in this period.
					</p>
				) : (
					<Table className="print:text-[10px]">
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Booking</TableHead>
								<TableHead>Guest</TableHead>
								<TableHead>Room</TableHead>
								<TableHead>Stay</TableHead>
								{DETAIL_AMOUNTS.map((c) => (
									<TableHead key={c.key} className={NUMERIC}>
										{c.label}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{report.rows.map((row) => (
								<DetailRow key={`${row.type}-${row.id}`} row={row} />
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function DetailRow({ row }: { row: TaxReportRow }) {
	return (
		<TableRow className="break-inside-avoid print:[&>td]:p-1">
			<TableCell>{formatStayDate(row.date, 'short')}</TableCell>
			<TableCell>
				{row.type === 'payment' ? 'Payment' : 'Refund'}
				{row.estimated && (
					<Badge variant="outline" className="ml-2">
						Estimated
					</Badge>
				)}
			</TableCell>
			<TableCell>
				{row.bookingPublicId ? (
					<Link
						to="/admin/bookings/$publicId"
						params={{ publicId: row.bookingPublicId }}
						className="font-medium underline underline-offset-2 print:no-underline"
					>
						{row.confirmationId}
					</Link>
				) : (
					<span className="text-muted-foreground">No booking</span>
				)}
			</TableCell>
			<TableCell>{row.guestName}</TableCell>
			<TableCell>{row.roomName}</TableCell>
			<TableCell>
				{row.checkInDate && row.checkOutDate
					? `${formatStayDate(row.checkInDate, 'short')} to ${formatStayDate(row.checkOutDate, 'short')}`
					: null}
			</TableCell>
			{DETAIL_AMOUNTS.map((c) => (
				<TableCell key={c.key} className={NUMERIC}>
					{row.linked || c.key === 'total' ? money(row[c.key]) : null}
				</TableCell>
			))}
		</TableRow>
	);
}
