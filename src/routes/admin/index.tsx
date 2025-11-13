import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
import { requireAdmin } from '@/utils/auth-check';

export const Route = createFileRoute('/admin/')({
	head: () => ({
		meta: [
			{
				title: 'Property Admin | Irishette.com',
			},
		],
	}),
	beforeLoad: async ({ location }) => {
		// Check user is authenticated and has admin role
		const session = await requireAdmin(location);

		// Return session data to be available in component during SSR
		return { session };
	},
	loader: async () => {
		// Pre-fetch rooms and bookings in parallel before component renders
		const [roomsData, bookingsData] = await Promise.all([
			trpcClient.rooms.list.query({ limit: 10, status: 'active' }),
			trpcClient.bookings.adminListBookings.query({ limit: 50, offset: 0 }),
		]);

		return { rooms: roomsData, bookings: bookingsData };
	},
	component: AdminDashboard,
});

// Types for room data
type Room = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	basePrice: number;
	status: 'active' | 'inactive' | 'archived';
	isActive: boolean | null;
	createdAt: Date;
	updatedAt: Date;
};

function AdminDashboard() {
	// Get pre-loaded data from loader
	const loaderData = Route.useLoaderData();

	// Use queries with initialData from loader for live updates
	const { data: roomsData, isLoading: loadingRooms } = useQuery({
		...trpc.rooms.list.queryOptions({ limit: 10, status: 'active' }),
		initialData: loaderData.rooms,
		staleTime: 5 * 60 * 1000,
	});

	const rooms = roomsData?.rooms || [];

	// Use query with initialData from loader
	const { data: bookings = [], isLoading: loadingBookings } = useQuery({
		...trpc.bookings.adminListBookings.queryOptions({ limit: 50, offset: 0 }),
		initialData: loaderData.bookings,
		staleTime: 5 * 60 * 1000,
	});

	// Filter bookings to get confirmed ones with check-in date today or in the future
	const today = new Date();
	const todayDateString = today.toISOString().slice(0, 10); // 'YYYY-MM-DD'

	// Create a map of room IDs to room names for lookup
	const roomMap = rooms.reduce((acc: Record<string, string>, room: Room) => {
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
						<p className="text-sm text-muted-foreground">
							Shows 3 current bookings
						</p>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{loadingBookings ? (
								<div className="text-center py-4 text-muted-foreground">
									Loading bookings...
								</div>
							) : upcomingBookings.length === 0 ? (
								<div className="text-center py-4 text-muted-foreground">
									No upcoming bookings
								</div>
							) : (
								upcomingBookings.map((bookingData) => {
									const booking = bookingData.booking;
									return (
										<Link
											key={booking.id}
											to="/admin/bookings/$bookingId"
											params={{ bookingId: booking.id }}
											className="block"
										>
											<div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50 hover:bg-muted transition-colors">
												<div>
													<h3 className="font-medium">
														{' '}
														Check-in:{' '}
														{new Date(
															`${booking.checkInDate}T00:00:00`,
														).toLocaleDateString()}
													</h3>
													<p className="text-sm text-muted-foreground">
														{roomMap[bookingData.booking.roomId] ||
															'Unknown Room'}
													</p>
													<p className="text-sm text-muted-foreground">
														{booking.guestName}
													</p>
													<p className="text-xs text-muted-foreground">
														{booking.numberOfGuests} guest
														{booking.numberOfGuests !== 1 ? 's' : ''} • $
														{booking.totalAmount.toFixed(2)}
													</p>
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant={
															booking.status === 'confirmed'
																? 'secondary'
																: booking.status === 'cancelled'
																	? 'destructive'
																	: 'outline'
														}
														className="uppercase"
													>
														{booking.status}
													</Badge>
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
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{loadingRooms ? (
								<div className="text-center py-4 text-muted-foreground">
									Loading rooms...
								</div>
							) : rooms.length === 0 ? (
								<div className="text-center py-4 text-muted-foreground">
									No rooms found
								</div>
							) : (
								rooms.slice(0, 3).map((room: Room) => (
									<Link
										key={room.id}
										to="/admin/property-management/$roomId"
										params={{ roomId: room.id }}
										className="block"
									>
										<div className="flex items-center justify-between p-4 bg-muted hover:bg-muted/50 border rounded-lg">
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
		</AdminLayout>
	);
}
