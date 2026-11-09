import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	ADMIN_BOOKING_COLUMNS,
	BookingsTable,
	byCheckIn,
} from '@/components/booking/BookingsTable';
import { useTRPC } from '@/integrations/trpc/react';

const ADMIN_BOOKINGS_INPUT = { limit: 100, offset: 0 };

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/current-bookings',
)({
	head: () => ({
		meta: [
			{
				title: 'Current & Upcoming Bookings | Irishette.com',
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
	component: AdminBookings,
});

function AdminBookings() {
	const trpc = useTRPC();

	const { data: bookingsData } = useSuspenseQuery(
		trpc.bookings.adminListBookings.queryOptions(ADMIN_BOOKINGS_INPUT),
	);

	// Current and upcoming confirmed stays (stay phase from the server, in
	// property time).
	const bookings = bookingsData.filter(
		(row) => row.booking.status === 'confirmed' && row.stayPhase !== 'past',
	);

	return (
		<AdminLayout title="Current & Upcoming Bookings">
			<div className="mb-6">
				<p className="text-muted-foreground">
					Manage and view current and upcoming property bookings
				</p>
			</div>

			<BookingsTable
				data={bookings}
				columns={ADMIN_BOOKING_COLUMNS}
				initialState={byCheckIn(false)}
				title="Current Bookings"
				searchPlaceholder="Search bookings..."
				searchClassName="w-[300px]"
				emptyMessage="No bookings found."
				noun="bookings"
				scroll
				className="max-w-full overflow-hidden"
			/>
		</AdminLayout>
	);
}
