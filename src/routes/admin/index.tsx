import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarDays, DollarSign, Eye, Users } from 'lucide-react';
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

function AdminDashboard() {
	const { data: session, isPending } = useSession();
	const navigate = useNavigate();
	const [rooms, setRooms] = useState<Room[]>([]);
	const [loadingRooms, setLoadingRooms] = useState(true);

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

	// Client-side auth check
	useEffect(() => {
		if (!isPending && (!session?.user || session.user.role !== 'admin')) {
			navigate({ to: '/' });
		}
	}, [session, isPending, navigate]);

	// Load rooms on component mount
	useEffect(() => {
		if (session?.user && session.user.role === 'admin') {
			loadRooms();
		}
	}, [session, loadRooms]);

	// Show loading or redirect if not authenticated
	if (isPending || !session?.user || session.user.role !== 'admin') {
		return <div className="container mx-auto px-4 py-8">Loading...</div>;
	}

	// Mock data for now - we'll wire up tRPC later
	const stats = {
		total: 25,
		pending: 3,
		totalRevenue: 1250.0,
	};

	const bookings = [
		{
			booking: {
				id: '1',
				status: 'confirmed',
				paymentStatus: 'paid',
				guestName: 'John Doe',
				checkInDate: '2025-09-15',
				checkOutDate: '2025-09-17',
				roomId: '1',
			},
		},
		{
			booking: {
				id: '2',
				status: 'pending',
				paymentStatus: 'pending',
				guestName: 'Jane Smith',
				checkInDate: '2025-09-20',
				checkOutDate: '2025-09-22',
				roomId: '2',
			},
		},
	];

	const totalBookings = stats.total;
	const pendingBookings = stats.pending;
	const totalRevenue = stats.totalRevenue;

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
							Total Bookings
						</CardTitle>
						<CalendarDays className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{totalBookings}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Pending Bookings
						</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{pendingBookings}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
					</CardContent>
				</Card>
			</div>

			{/* Rooms and Recent Bookings */}
			{/* Rooms and Recent Bookings */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
											<Link to="/admin/property-management">
												<Button size="sm" variant="outline">
													<Eye className="h-4 w-4" />
												</Button>
											</Link>
										</div>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>{' '}
				{/* Recent Bookings */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>Recent Bookings</CardTitle>
							<Link to="/admin/bookings">
								<Button size="sm">View All Bookings</Button>
							</Link>
						</div>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{bookings?.slice(0, 5).map((bookingData) => {
								const booking = bookingData.booking;
								const room = rooms.find((r: Room) => r.id === booking.roomId);
								return (
									<div
										key={booking.id}
										className="flex items-center justify-between p-4 border rounded-lg"
									>
										<div>
											<h3 className="font-medium">{booking.guestName}</h3>
											<p className="text-sm text-muted-foreground">
												{room?.name || 'Unknown Room'} • {booking.checkInDate}{' '}
												to {booking.checkOutDate}
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
								);
							})}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
