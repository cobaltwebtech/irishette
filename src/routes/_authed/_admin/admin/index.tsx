import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { BookingsChart } from '@/components/admin/BookingsChart';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';

// Shared by the loader and the component so the cache keys match.
const ROOMS_INPUT = { limit: 10, status: 'active' as const };
const BOOKINGS_INPUT = { limit: 50, offset: 0 };
const MONTHLY_STATS_INPUT = { months: 12, status: 'confirmed' as const };

export const Route = createFileRoute('/_authed/_admin/admin/')({
	head: () => ({
		meta: [
			{
				title: 'Property Admin | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Rooms, bookings and monthly stats are
	// preloaded in parallel for SSR.
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.rooms.list.queryOptions(ROOMS_INPUT),
			),
			context.queryClient.ensureQueryData(
				context.trpc.bookings.adminListBookings.queryOptions(BOOKINGS_INPUT),
			),
			context.queryClient.ensureQueryData(
				context.trpc.bookings.adminGetMonthlyStats.queryOptions(
					MONTHLY_STATS_INPUT,
				),
			),
		]),
	component: AdminDashboard,
});

function AdminDashboard() {
	const trpc = useTRPC();

	const { data: roomsData } = useSuspenseQuery(
		trpc.rooms.list.queryOptions(ROOMS_INPUT),
	);
	const rooms = roomsData.rooms;

	const { data: bookings } = useSuspenseQuery(
		trpc.bookings.adminListBookings.queryOptions(BOOKINGS_INPUT),
	);

	const { data: monthlyStats } = useSuspenseQuery(
		trpc.bookings.adminGetMonthlyStats.queryOptions(MONTHLY_STATS_INPUT),
	);

	// Filter bookings to get confirmed ones with check-in date today or in the future
	const today = new Date();
	const todayDateString = today.toISOString().slice(0, 10); // 'YYYY-MM-DD'

	// Create a map of room IDs to room names for lookup
	const roomMap = rooms.reduce((acc: Record<string, string>, room) => {
		acc[room.id] = room.name;
		return acc;
	}, {});

	const upcomingBookings = bookings
		.filter((bookingData) => {
			const checkInDateString = bookingData.booking.checkInDate.slice(0, 10); // 'YYYY-MM-DD'
			return (
				checkInDateString >= todayDateString &&
				bookingData.booking.status === 'confirmed'
			);
		})
		.sort(
			(a, b) =>
				new Date(a.booking.checkInDate).getTime() -
				new Date(b.booking.checkInDate).getTime(),
		)
		.slice(0, 3);

	return (
		<AdminLayout title="Property Admin Dashboard">
			{/* Rooms and Recent Bookings */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Upcoming Bookings Details */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>Current & Upcoming Bookings</CardTitle>
							<Link to="/admin/bookings/current-bookings">
								<Button size="sm">View Current Bookings</Button>
							</Link>
						</div>
						<p className="text-xs text-muted-foreground">
							Shows 3 current bookings. Click on booking to view details.
						</p>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{upcomingBookings.length === 0 ? (
								<div className="text-center py-4 text-muted-foreground">
									No upcoming bookings
								</div>
							) : (
								upcomingBookings.map((bookingData) => {
									const booking = bookingData.booking;
									return (
										<Link
											key={booking.id}
											to="/admin/bookings/$publicId"
											params={{ publicId: booking.publicId }}
											className="block"
										>
											<div className="flex items-center justify-between p-2 border rounded-lg bg-muted/50 hover:bg-muted transition-colors">
												<div>
													<h3 className="font-medium">
														{new Date(
															`${booking.checkInDate}T00:00:00`,
														).toLocaleDateString()}
													</h3>
													<p className="text-sm font-semibold text-muted-foreground">
														{roomMap[bookingData.booking.roomId] ||
															'Unknown Room'}
													</p>
												</div>
												<div className="flex items-center gap-2">
													<p className="text-sm font-semibold text-muted-foreground">
														{booking.guestName}
													</p>
													<p className="text-xs text-muted-foreground">
														{booking.numberOfGuests} guest
														{booking.numberOfGuests !== 1 ? 's' : ''} • $
														{booking.totalAmount.toFixed(2)}
													</p>
												</div>
											</div>
										</Link>
									);
								})
							)}
						</div>
					</CardContent>
				</Card>

				{/* Rooms Overview */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>Rooms</CardTitle>
							<Link to="/admin/property-management">
								<Button size="sm">View All Rooms</Button>
							</Link>
						</div>
						<p className="text-xs text-muted-foreground">
							Shows all active rooms for the property. Click on room to edit.
						</p>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{rooms.length === 0 ? (
								<div className="text-center py-4 text-muted-foreground">
									No rooms found
								</div>
							) : (
								rooms.slice(0, 3).map((room) => (
									<Link
										key={room.id}
										to="/admin/property-management/$publicId"
										params={{ publicId: room.publicId }}
										className="block"
									>
										<div className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted border rounded-lg">
											<div>
												<h3 className="font-medium">{room.name}</h3>
												<p className="text-sm text-muted-foreground">
													Base Price: ${room.basePrice}/night
												</p>
											</div>
											<div className="flex items-center gap-2">
												<Badge
													variant={
														room.status === 'active' ? 'secondary' : 'outline'
													}
													className="uppercase"
												>
													{room.status}
												</Badge>
											</div>
										</div>
									</Link>
								))
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Monthly Bookings Chart */}
			<div className="mb-8">
				<BookingsChart data={monthlyStats} />
			</div>

			{/* Monthly Revenue Chart */}
			<div className="mb-8">
				<RevenueChart data={monthlyStats} />
			</div>
		</AdminLayout>
	);
}
