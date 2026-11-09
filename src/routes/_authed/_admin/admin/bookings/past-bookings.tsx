import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	ADMIN_PAST_BOOKING_COLUMNS,
	BookingsTable,
	byCheckIn,
} from '@/components/booking/BookingsTable';
import { useTRPC } from '@/integrations/trpc/react';

// Same input as current-bookings, so both share one cache entry.
const ADMIN_BOOKINGS_INPUT = { limit: 100, offset: 0 };

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/past-bookings',
)({
	head: () => ({
		meta: [
			{
				title: 'Past Bookings | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Bookings are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.bookings.adminListBookings.queryOptions(
				ADMIN_BOOKINGS_INPUT,
			),
		),
	component: PastBookings,
});

function PastBookings() {
	const trpc = useTRPC();

	const { data: bookingsData } = useSuspenseQuery(
		trpc.bookings.adminListBookings.queryOptions(ADMIN_BOOKINGS_INPUT),
	);

	// Past confirmed stays (stay phase from the server, in property time).
	const bookings = bookingsData.filter(
		(row) => row.booking.status === 'confirmed' && row.stayPhase === 'past',
	);

	return (
		<AdminLayout title="Past Bookings">
			<div className="mb-6">
				<p className="text-muted-foreground">
					Historical records of completed bookings
				</p>
			</div>

			<BookingsTable
				data={bookings}
				columns={ADMIN_PAST_BOOKING_COLUMNS}
				initialState={{
					// Most recent stays first
					...byCheckIn(true),
					// Show more records per page for historical view
					pagination: { pageIndex: 0, pageSize: 25 },
				}}
				title="Past Bookings"
				searchPlaceholder="Search past bookings..."
				searchClassName="w-[300px]"
				emptyMessage="No past bookings found."
				noun="past bookings"
				scroll
				className="max-w-full overflow-hidden"
			/>
		</AdminLayout>
	);
}
