import { createFileRoute, useRouter } from '@tanstack/react-router';
import { LogOut, Settings, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { client, useSession } from '@/lib/auth-client';

// Interface for booking data returned from tRPC
interface BookingData {
	booking: {
		id: string;
		confirmationId: string;
		userId: string;
		roomId: string;
		checkInDate: string;
		checkOutDate: string;
		numberOfNights: number;
		numberOfGuests: number;
		baseAmount: number;
		taxAmount: number | null;
		feesAmount: number | null;
		discountAmount: number | null;
		totalAmount: number;
		status: string;
		paymentStatus: string;
		guestName: string;
		guestEmail: string;
		guestPhone: string | null;
		specialRequests: string | null;
		internalNotes: string | null;
		stripeCustomerId: string | null;
		stripeSessionId: string | null;
		stripePaymentIntentId: string | null;
		createdAt: Date;
		updatedAt: Date;
		confirmedAt: Date | null;
		cancelledAt: Date | null;
	};
	room: {
		id: string;
		name: string;
		slug: string;
		basePrice: number;
	};
}

export const Route = createFileRoute('/account/')({
	head: () => ({
		meta: [
			{
				title: 'My Account | Irishette.com',
			},
		],
	}),
	component: AccountPage,
});

function AccountPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const [bookings, setBookings] = useState<BookingData[]>([]);

	// Redirect if not logged in
	useEffect(() => {
		if (!isPending && !session) {
			router.navigate({ to: '/login' });
		}
	}, [session, isPending, router]);

	// Fetch user's bookings
	useEffect(() => {
		const fetchBookings = async () => {
			if (!session?.user?.id) return;

			try {
				const response = await fetch('/api/trpc/bookings.getMyBookings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						userId: session.user.id,
						limit: 10,
						offset: 0,
						status: 'confirmed',
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
				console.error('Failed to fetch bookings:', error);
			}
		};

		if (session?.user?.id) {
			fetchBookings();
		}
	}, [session?.user?.id]);

	const handleSignOut = async () => {
		try {
			await client.signOut();
			router.navigate({ to: '/' });
		} catch (error) {
			console.error('Sign out error:', error);
		}
	};

	if (isPending) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading your dashboard...</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return null; // Will redirect via useEffect
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Welcome back, {session.user.name || session.user.email}
							</h1>
							<p className="text-muted-foreground">
								Manage your bookings and account settings
							</p>
						</div>
						<Button variant="outline" onClick={handleSignOut}>
							<LogOut className="w-4 h-4 mr-2" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				{/* Bookings Table */}
				{bookings.length > 0 && (
					<Card className="mb-8">
						<CardHeader>
							<CardTitle>My Bookings</CardTitle>
							<CardDescription>
								Your confirmed bookings. Click on the booking to view more
								details.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Confirmation</TableHead>
										<TableHead>Room</TableHead>
										<TableHead>Dates</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Amount</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{bookings.map((bookingData) => (
										<TableRow
											key={bookingData.booking.id}
											className="cursor-pointer hover:bg-muted/50 transition-colors"
											onClick={() => {
												const link = document.createElement('a');
												link.href = `/account/booking/${bookingData.booking.id}`;
												link.click();
											}}
										>
											<TableCell>
												<Badge
													variant="outline"
													className="font-mono font-bold text-base tracking-wider"
												>
													{bookingData.booking.confirmationId}
												</Badge>
											</TableCell>
											<TableCell>{bookingData.room.name}</TableCell>
											<TableCell>
												<div className="text-sm">
													<div>
														{new Date(
															bookingData.booking.checkInDate,
														).toLocaleDateString()}
													</div>
													<div>
														to{' '}
														{new Date(
															bookingData.booking.checkOutDate,
														).toLocaleDateString()}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														bookingData.booking.status === 'confirmed'
															? 'default'
															: bookingData.booking.status === 'cancelled'
																? 'destructive'
																: 'secondary'
													}
													className="capitalize"
												>
													{bookingData.booking.status}
												</Badge>
											</TableCell>
											<TableCell className="text-right font-medium">
												${bookingData.booking.totalAmount.toFixed(2)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				)}

				<div className="grid gap-6 md:grid-cols-2">
					{/* Account Info Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<User className="w-5 h-5 mr-2" />
								Account Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Email
									</p>
									<p className="text-foreground">{session.user.email}</p>
								</div>
								{session.user.name && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Name
										</p>
										<p className="text-foreground">{session.user.name}</p>
									</div>
								)}
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Member Since
									</p>
									<p className="text-foreground">
										{new Date(session.user.createdAt).toLocaleDateString()}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Quick Actions Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Settings className="w-5 h-5 mr-2" />
								Quick Actions
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<p>Update Profile</p>
								<Button>Edit your information</Button>
							</div>
							<div>
								<p>Have questions or need assistance?</p>
								<Button variant="secondary">Contact Us</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
