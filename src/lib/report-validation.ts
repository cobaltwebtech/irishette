import { z } from 'zod';

import {
	addMonths,
	type IsoDate,
	isIsoDate,
	isoDateSchema,
} from './date-range';
import {
	type DateRange,
	periodOf,
	periodRange,
	type TaxReportPreset,
	taxReportPresets,
} from './tax-report';

// Inputs of the admin report procedures (src/integrations/trpc/reports.ts)
// and the report page's search params.

/** Longest period one report may cover. */
export const TAX_REPORT_MAX_MONTHS = 24;

/** Report period: property-local (Central Time) dates, both inclusive. */
export const taxReportInputSchema = z
	.object({ from: isoDateSchema, to: isoDateSchema })
	.refine((v) => v.from <= v.to, {
		message: 'The start date must not be after the end date',
		path: ['to'],
	})
	.refine(
		// Invalid dates are reported by the fields; skip the span check then.
		(v) =>
			!isIsoDate(v.from) || v.to < addMonths(v.from, TAX_REPORT_MAX_MONTHS),
		{
			message: `A report can cover at most ${TAX_REPORT_MAX_MONTHS} months`,
			path: ['to'],
		},
	);

export type TaxReportInput = z.infer<typeof taxReportInputSchema>;

/**
 * Search params of /admin/reports/tax. Anything invalid is dropped, so a
 * hand-edited URL shows the default report instead of an error.
 */
export const taxReportSearchSchema = z.object({
	preset: z.enum(taxReportPresets).optional().catch(undefined),
	/** `2026-11`, `2026-Q4` or `2026`, matching the preset. */
	period: z.string().max(7).optional().catch(undefined),
	/** Custom range only. */
	from: isoDateSchema.optional().catch(undefined),
	to: isoDateSchema.optional().catch(undefined),
});

export type TaxReportSearch = z.infer<typeof taxReportSearchSchema>;

export interface TaxReportSelection {
	preset: TaxReportPreset;
	/** Null for a custom range. */
	period: string | null;
	range: DateRange;
}

/**
 * The report the search params ask for. Defaults: the month preset, the
 * period that contains `today`, and (custom) the current month's dates.
 */
export function resolveTaxReportSearch(
	search: TaxReportSearch,
	today: IsoDate,
): TaxReportSelection {
	const preset = search.preset ?? 'month';
	if (preset === 'custom') {
		const custom = taxReportInputSchema.safeParse(search);
		return {
			preset,
			period: null,
			range: custom.success
				? custom.data
				: // Always valid for a real date.
					(periodRange('month', periodOf('month', today)) as DateRange),
		};
	}
	const asked = search.period ? periodRange(preset, search.period) : null;
	const period =
		asked && search.period ? search.period : periodOf(preset, today);
	return {
		preset,
		period,
		range: asked ?? (periodRange(preset, period) as DateRange),
	};
}
