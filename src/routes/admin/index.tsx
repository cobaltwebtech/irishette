import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarDays, House, Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

// Types for booking data (matching the tRPC response structure)
type BookingData = {
	booking: {
		id: string;
		confirmationId: string;
		status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
		paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
		guestName: string;
		guestEmail: string;
		checkInDate: string;
		checkOutDate: string;
		totalAmount: number;
		numberOfGuests: number;
		createdAt: string;
		roomId: string;
	};
	room: {
		id: string;
		name: string;
		slug: string;
		basePrice: number;
	};
	user: {
		id: string;
		email: string;
		name?: string;
	};
};

function AdminDashboard() {
	const { data: session, isPending } = useSession();
	const navigate = useNavigate();
	const [rooms, setRooms] = useState<Room[]>([]);
	const [loadingRooms, setLoadingRooms] = useState(true);
	const [bookings, setBookings] = useState<BookingData[]>([]);
	const [loadingBookings, setLoadingBookings] = useState(true);

	// Load rooms function
	const loadRooms = useCallback(async () => {
		try {
			setLoadingRooms(true);
			const inputParam = encodeURIComponent(
				JSON.stringify({ limit: 10, status: 'active' }),
			);
			const response = await fetch(`/api/trpc/rooms.list?input=${inputParam}`, {
				method: 'GET',
			});

			if (!response.ok) {
				throw new Error('Failed to fetch rooms');
			}

			const data = (await response.json()) as {
				result: { data: { rooms: Room[] } };
			};
			setRooms(data.result.data.rooms || []);
		} catch (error) {
			console.error('Failed to load rooms:', error);
		} finally {
			setLoadingRooms(false);
		}
	}, []);

	// Load bookings function
	const loadBookings = useCallback(async () => {
		try {
			setLoadingBookings(true);
			const response = await fetch('/api/trpc/bookings.adminListBookings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					limit: 50, // Get more to filter for upcoming
					offset: 0,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to fetch bookings');
			}

			const result = (await response.json()) as {
				result?: {
					data?: BookingData[];
				};
			};

			const bookingsData = result.result?.data || [];
			setBookings(bookingsData);
		} catch (error) {
			console.error('Failed to load bookings:', error);
		} finally {
			setLoadingBookings(false);
		}
	}, []);

	// Client-side auth check
	useEffect(() => {
		if (!isPending && (!session?.user || session.user.role !== 'admin')) {
			navigate({ to: '/' });
		}
	}, [session, isPending, navigate]);

	// Load bookings on component mount
	useEffect(() => {
		if (session?.user && session.user.role === 'admin') {
			loadRooms();
			loadBookings();
		}
	}, [session, loadRooms, loadBookings]);

	// Show loading or redirect if not authenticated
	if (isPending || !session?.user || session.user.role !== 'admin') {
		return <div className="container mx-auto px-4 py-8">Loading...</div>;
	}

	// Filter bookings to get upcoming confirmed ones (check-in date >= today)
	const today = new Date();
	today.setHours(0, 0, 0, 0);

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
														{bookingData.room.name} • Check-in:{' '}
														{new Date(booking.checkInDate).toLocaleDateString()}
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
