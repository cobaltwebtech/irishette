import { z } from 'zod';

import { addMonths, isIsoDate, isoDateSchema } from './date-range';

// Inputs of the admin report procedures (src/integrations/trpc/reports.ts).

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
