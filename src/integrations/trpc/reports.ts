import { taxReportInputSchema } from '@/lib/reports/report-validation';
import { getTaxReport } from '@/lib/reports/tax-report-service';

import { adminProcedure, createTRPCRouter } from './init';

// Admin reports (docs/TAX_REPORTING.md). Admin-only.

export const reportsRouter = createTRPCRouter({
	/** Hotel Occupancy Tax collected in a period (payment-date basis). */
	adminTaxReport: adminProcedure
		.input(taxReportInputSchema)
		.query(({ ctx, input }) => getTaxReport(ctx, input)),
});
