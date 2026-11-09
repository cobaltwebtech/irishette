import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import {
	ACCOUNT_BOOKING_COLUMNS,
	BookingsTable,
	byCheckIn,
} from '@/components/booking/BookingsTable';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/twMerge';

// Same input as the account page, so both share one cache entry.
const MY_BOOKINGS_INPUT = { limit: 50, offset: 0 };

export const Route = createFileRoute('/_authed/account/past-bookings')({
	head: () => ({
		meta: [
			{
				title: 'Past Bookings | Irishette.com',
			},
		],
	}),
	// Auth: the _authed layout. Bookings are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
		),
	component: PastBookingsPage,
});

function PastBookingsPage() {
	const trpc = useTRPC();

	const { data: allBookings } = useSuspenseQuery(
		trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
	);

	// Past confirmed stays, by the server's stay phase (property time).
	const bookings = allBookings.filter(
		(row) =>
			row.booking.status === 'confirmed' && row.booking.stayPhase === 'past',
	);

	return (
		<div className="bg-background">
			{/* Header */}
			<div className="border-b bg-primary/5">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Past Bookings
							</h1>
							<p className="text-muted-foreground">
								View your previous booking history
							</p>
						</div>
						<Link
							to="/account"
							data-slot="button"
							className={cn(buttonVariants({ variant: 'outline' }))}
						>
							← Back to Account
						</Link>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				{/* Conditional Rendering: Show table if bookings exist, otherwise show empty state */}
				{bookings.length > 0 ? (
					<BookingsTable
						data={bookings}
						columns={ACCOUNT_BOOKING_COLUMNS}
						initialState={byCheckIn(true)}
						title="Past Bookings"
						description="Your previous confirmed bookings. Click on the confirmation ID to view more details."
						searchPlaceholder="Search bookings..."
						searchClassName="w-[250px]"
						emptyMessage="No past bookings found."
						noun="bookings"
					/>
				) : (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Icon
								icon="tabler:calendar-check"
								className="mb-4 size-16 text-muted-foreground"
							/>
							<h3 className="mb-2 text-xl font-semibold">No Past Bookings</h3>
							<p className="mb-6 max-w-md text-center text-muted-foreground">
								You don't have any past bookings yet. Once your stay is
								complete, it will appear here.
							</p>
							<Link
								to="/account"
								data-slot="button"
								className={cn(buttonVariants())}
							>
								← Back to Account
							</Link>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
