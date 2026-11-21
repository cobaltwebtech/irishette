import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';

// Layout for one booking (plan 06): loads it for SSR once for the detail
// page (index) and the modify page (modify), and shows the not-found page.

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/$publicId',
)({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. The booking is preloaded for SSR; the guest
	// details (repeat-guest badge) depend on the booking's user publicId.
	loader: async ({ context, params }) => {
		const booking = await orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.bookings.adminGetBooking.queryOptions({
					publicId: params.publicId,
				}),
			),
		);
		if (booking.user) {
			// prefetchQuery never throws: guest details are optional here, a
			// failure only hides the repeat-guest badge (as before).
			await context.queryClient.prefetchQuery(
				context.trpc.users.adminGetGuestDetails.queryOptions({
					publicId: booking.user.publicId,
				}),
			);
		}
	},
	notFoundComponent: BookingNotFound,
	component: Outlet,
});

function BookingNotFound() {
	return (
		<AdminLayout title="Booking Not Found">
			<Card>
				<CardHeader>
					<CardTitle>Booking Not Found</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-muted-foreground">
						The booking you're looking for could not be found.
					</p>
					<Link to="/admin/bookings/current-bookings">
						<Button>Back to Bookings</Button>
					</Link>
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
