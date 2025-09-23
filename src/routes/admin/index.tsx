import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarDays, House, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/admin/')({
	head: () => ({
		meta: [
			{
				title: 'Admin Dashboard | Irishette.com',
			},
		],
	}),
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
	const { data: session, isPending } = useSession();
	const navigate = useNavigate();

	// Replace manual loadRooms with useQuery - using direct trpc import
	const {
		data: roomsData,
		isLoading: loadingRooms,
		error: roomsError,
		isError: roomsIsError,
	} = useQuery(
		trpc.rooms.list.queryOptions(
			{
				limit: 10,
				status: 'active',
			},
			{
				enabled: !isPending && !!session?.user && session.user.role === 'admin',
				retry: false, // Avoid retries during SSR issues
				staleTime: 5 * 60 * 1000, // 5 minutes
			},
		),
	);

	console.log('Admin Dashboard - rooms useQuery state:', {
		roomsData,
		loadingRooms,
		roomsError,
		roomsIsError,
		hasSession: !!session?.user,
		isAdmin: session?.user?.role === 'admin',
	});

	const rooms = roomsData?.rooms || [];

	// Replace manual loadBookings with useQuery
	// Replace manual loadBookings with useQuery - using direct trpc import
	const {
		data: bookings = [],
		isLoading: loadingBookings,
		error: bookingsError,
		isError: bookingsIsError,
	} = useQuery(
		trpc.bookings.adminListBookings.queryOptions(
			{
				limit: 50,
				offset: 0,
			},
			{
				enabled: !isPending && !!session?.user && session.user.role === 'admin',
				retry: false, // Avoid retries during SSR issues
				staleTime: 5 * 60 * 1000, // 5 minutes
			},
		),
	);

	console.log('Admin Dashboard - bookings useQuery state:', {
		bookings,
		loadingBookings,
		bookingsError,
		bookingsIsError,
		hasSession: !!session?.user,
		isAdmin: session?.user?.role === 'admin',
	});

	// Client-side auth check
	useEffect(() => {
		if (!isPending && (!session?.user || session.user.role !== 'admin')) {
			navigate({ to: '/' });
		}
	}, [session, isPending, navigate]);

	// Show loading or redirect if not authenticated
	if (isPending || !session?.user || session.user.role !== 'admin') {
		return <div className="container mx-auto px-4 py-8">Loading...</div>;
	}

	// Filter bookings to get upcoming confirmed ones (check-in date >= today)
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Create a map of room IDs to room names for lookup
	const roomMap = rooms.reduce((acc: Record<string, string>, room: Room) => {
		acc[room.id] = room.name;
		return acc;
	}, {});

	const upcomingBookings = bookings
		.filter((bookingData) => {
			const checkInDate = new Date(bookingData.booking.checkInDate);
			checkInDate.setHours(0, 0, 0, 0);
			return checkInDate >= today && bookingData.booking.status === 'confirmed';
		})
		.sort(
			(a, b) =>
				new Date(a.booking.checkInDate).getTime() -
				new Date(b.booking.checkInDate).getTime(),
		)
		.slice(0, 3);

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold">Admin Dashboard</h1>
				<p className="text-muted-foreground">
					Welcome back, {session?.user.name || session?.user.email}
				</p>
			</div>

			{/* Stats Overview */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Upcoming Bookings
						</CardTitle>
						<CalendarDays className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<Link to="/admin/bookings">
							<div className="text-2xl font-bold">
								{upcomingBookings.length}
							</div>
						</Link>
					</CardContent>
				</Card>

				{/* Placeholder for second column - you can add another metric here */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Rooms</CardTitle>
						<House className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{rooms.length}</div>
					</CardContent>
				</Card>

				{/* Quick Actions */}
				<Card>
					<CardHeader>
						<CardTitle>Quick Actions</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							<Link to="/admin/bookings" className="block">
								<Button className="w-full justify-start" variant="outline">
									📋 View All Bookings
								</Button>
							</Link>
							<Link to="/admin/property-management" className="block">
								<Button className="w-full justify-start" variant="outline">
									🏠 Property Management
								</Button>
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Rooms and Recent Bookings */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Upcoming Bookings Details */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>Upcoming Bookings</CardTitle>
							<Link to="/admin/bookings">
								<Button size="sm">View All Bookings</Button>
							</Link>
						</div>
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
											<div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
												<div>
													<h3 className="font-medium">{booking.guestName}</h3>
													<p className="text-sm text-muted-foreground">
														{roomMap[bookingData.booking.roomId] ||
															'Unknown Room'}{' '}
														• Check-in:{' '}
														{new Date(
															booking.checkInDate + 'T00:00:00',
														).toLocaleDateString()}
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
																? 'default'
																: booking.status === 'cancelled'
																	? 'destructive'
																	: 'secondary'
														}
													>
														{booking.status}
													</Badge>
													<Badge
														variant={
															booking.paymentStatus === 'paid'
																? 'default'
																: 'secondary'
														}
													>
														{booking.paymentStatus}
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
									<div
										key={room.id}
										className="flex items-center justify-between p-4 border rounded-lg"
									>
										<div>
											<h3 className="font-medium">{room.name}</h3>
											<p className="text-sm text-muted-foreground">
												Base Price: ${room.basePrice}/night
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge
												variant={
													room.status === 'active' ? 'default' : 'secondary'
												}
											>
												{room.status}
											</Badge>
											<Link
												to="/admin/property-management/$roomId"
												params={{ roomId: room.id }}
											>
												<Button size="sm" variant="outline">
													<Pencil className="h-4 w-4" />
												</Button>
											</Link>
										</div>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
