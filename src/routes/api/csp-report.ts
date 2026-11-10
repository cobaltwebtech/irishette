import { createFileRoute } from '@tanstack/react-router';

import { rateLimitRequests } from '@/core/middleware/rate-limit';
import { handleCspReport } from '@/lib/security/csp-report';

// Browser CSP violation reports (report-uri and report-to) during the
// report-only period. Summaries go to Workers Logs; nothing is stored.
export const Route = createFileRoute('/api/csp-report')({
	server: {
		middleware: [
			rateLimitRequests('CSP_REPORT_RATE_LIMITER', { scope: 'csp-report' }),
		],
		handlers: {
			POST: ({ request }) => handleCspReport(request),
		},
	},
});
