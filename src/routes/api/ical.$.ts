import { createFileRoute } from '@tanstack/react-router';

import { handleIcalExportRequest } from '@/lib/ical/ical-export';

// Server route for the iCal export feed (handler in src/lib/ical/ical-export.ts).
export const Route = createFileRoute('/api/ical/$')({
	server: {
		handlers: {
			GET: ({ request }) => handleIcalExportRequest(request),
		},
	},
});
