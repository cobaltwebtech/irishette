import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import {
	ArrowLeft,
	Calendar,
	CreditCard,
	Eye,
	Mail,
	Settings,
	User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/auth-client';

// Interface for detailed booking data (matching the user interface but with admin fields)
interface AdminBookingDetailData {
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
	user: {
		id: string;
		email: string;
		name?: string;
	};
}

export const Route = createFileRoute('/admin/bookings/$bookingId')({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	component: AdminBookingDetailPage,
});

function AdminBookingDetailPage() {
	const params = Route.useParams() as { bookingId: string };
	const bookingId = params.bookingId;
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const [booking, setBooking] = useState<AdminBookingDetailData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isResendingEmail, setIsResendingEmail] = useState(false);

	// Redirect if not admin
	useEffect(() => {
		if (!isPending && (!session || session.user.role !== 'admin')) {
			router.navigate({ to: '/admin' });
		}
	}, [session, isPending, router]);

	// Fetch booking details (admin version - no user restriction)
	useEffect(() => {
		const fetchBookingDetails = async () => {
			if (!session?.user?.id || session.user.role !== 'admin' || !bookingId)
				return;

			try {
				setIsLoading(true);
				setError(null);

				console.log('Fetching admin booking details for:', {
					bookingId,
					adminUserId: session.user.id,
				});

				// Admin version doesn't restrict by userId
				const response = await fetch('/api/trpc/bookings.getBooking', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						bookingId: bookingId,
						// Don't pass userId so admin can view any booking
					}),
				});

				console.log('Response status:', response.status);

				if (!response.ok) {
					const errorText = await response.text();
					console.error('Response error:', errorText);
					throw new Error('Failed to fetch booking details');
				}

				const result = (await response.json()) as {
					result?: {
						data?: AdminBookingDetailData;
					};
				};

				console.log('Received result:', result);

				const bookingData = result.result?.data;

				if (!bookingData) {
					throw new Error('Booking not found');
				}

				setBooking(bookingData);
			} catch (error) {
				console.error('Failed to fetch booking details:', error);
				setError(
					error instanceof Error
						? error.message
						: 'Failed to load booking details',
				);
			} finally {
				setIsLoading(false);
			}
		};

		if (session?.user?.role === 'admin') {
			fetchBookingDetails();
		}
	}, [session?.user?.id, session?.user?.role, bookingId]);

	// Handle resending confirmation email (admin can resend for any booking)
	const handleResendEmail = async () => {
		if (!booking?.booking || !session?.user?.id) return;

		setIsResendingEmail(true);

		try {
			console.log(
				'Admin resending confirmation email for booking:',
				booking.booking.id,
			);

			// Prepare the email data from existing booking information
			const emailData = {
				confirmationId: booking.booking.confirmationId,
				guestName: booking.booking.guestName,
				guestEmail: booking.booking.guestEmail,
				guestPhone: booking.booking.guestPhone || undefined,
				roomName: booking.room.name,
				checkInDate: booking.booking.checkInDate,
				checkOutDate: booking.booking.checkOutDate,
				numberOfNights: booking.booking.numberOfNights,
				numberOfGuests: booking.booking.numberOfGuests,
				specialRequests: booking.booking.specialRequests || undefined,
				baseAmount: booking.booking.baseAmount,
				taxAmount: booking.booking.taxAmount || 0,
				feesAmount: booking.booking.feesAmount || 0,
				totalAmount: booking.booking.totalAmount,
				baseUrl: window.location.origin,
			};

			// Call our API endpoint directly
			const response = await fetch('/api/send-confirmation-email/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(emailData),
			});

			if (!response.ok) {
				let errorMessage = 'Failed to send email';
				try {
					const errorData = (await response.json()) as { error?: string };
					errorMessage = errorData.error || errorMessage;
				} catch {
					// If JSON parsing fails, use default message
				}
				throw new Error(errorMessage);
			}

			const result = (await response.json()) as {
				success: boolean;
				message?: string;
				error?: string;
			};

			if (result.success) {
				toast.success('Email sent successfully!', {
					description:
						result.message || 'Confirmation email has been sent to the guest.',
				});
			} else {
				throw new Error(result.error || 'Failed to send confirmation email');
			}
		} catch (error) {
			console.error('Failed to resend confirmation email:', error);
			toast.error('Failed to send email', {
				description:
					error instanceof Error
						? error.message
						: 'Unable to send confirmation email. Please try again.',
			});
		} finally {
			setIsResendingEmail(false);
		}
	};

	// Early returns for various states
	if (isPending || isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading booking details...</p>
				</div>
			</div>
		);
	}

	if (!session || session.user.role !== 'admin') {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-2xl font-bold mb-4">Access Denied</h2>
					<p className="text-muted-foreground">
						You don't have permission to view this page.
					</p>
				</div>
			</div>
		);
	}

	if (error || (!isLoading && !booking)) {
		return (
			<div className="min-h-screen bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center gap-4">
							<Link
								to="/admin/bookings"
								className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back to Bookings
							</Link>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<Card>
						<CardHeader>
							<CardTitle>Error</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-red-600 mb-4">{error}</p>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => window.location.reload()}
								>
									Try Again
								</Button>
								<Link to="/admin/bookings">
									<Button>Back to Bookings</Button>
								</Link>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (!booking) {
		return (
			<div className="min-h-screen bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center gap-4">
							<Link
								to="/admin/bookings"
								className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back to Bookings
							</Link>
						</div>
					</div>
				</div>
				<div className="container mx-auto px-4 py-8">
					<Card>
						<CardHeader>
							<CardTitle>Booking Not Found</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground mb-4">
								The booking you're looking for could not be found.
							</p>
							<Link to="/admin/bookings">
								<Button>Back to Bookings</Button>
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// Final safety check - should not be needed but prevents runtime errors
	if (!booking || !booking.booking || !booking.room) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading booking details...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-4">
							<Button asChild>
								<Link to="/admin/bookings">
									<ArrowLeft className="w-4 h-4 mr-2" />
									Back to Bookings
								</Link>
							</Button>
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Admin Booking Details
								</h1>
								<p className="text-sm text-muted-foreground">
									Confirmation ID: {booking.booking.confirmationId}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Badge
								variant={
									booking.booking.status === 'confirmed'
										? 'default'
										: booking.booking.status === 'cancelled'
											? 'destructive'
											: 'secondary'
								}
								className="text-sm"
							>
								{booking.booking.status.toUpperCase()}
							</Badge>
							<Badge
								variant={
									booking.booking.paymentStatus === 'paid'
										? 'default'
										: booking.booking.paymentStatus === 'failed'
											? 'destructive'
											: 'secondary'
								}
								className="text-sm"
							>
								{booking.booking.paymentStatus.toUpperCase()}
							</Badge>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Left Column - Booking Details */}
					<div className="lg:col-span-2 space-y-6">
						{/* Customer Information */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<User className="w-5 h-5" />
									Customer Information
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Guest Name
										</p>
										<p className="font-semibold">{booking.booking.guestName}</p>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Email
										</p>
										<p className="font-semibold">
											{booking.booking.guestEmail}
										</p>
									</div>
								</div>
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Account Email
										</p>
										<p className="font-semibold">{booking.user.email}</p>
									</div>
									{booking.booking.guestPhone && (
										<div>
											<p className="text-sm font-medium text-muted-foreground">
												Phone
											</p>
											<p className="font-semibold">
												{booking.booking.guestPhone}
											</p>
										</div>
									)}
								</div>
								{booking.booking.specialRequests && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Special Requests
										</p>
										<p className="text-sm bg-muted p-3 rounded-md">
											{booking.booking.specialRequests}
										</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Reservation Details */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Calendar className="w-5 h-5" />
									Reservation Details
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Confirmation ID
										</p>
										<Badge
											variant="secondary"
											className="font-semibold font-mono tracking-wider text-lg"
										>
											{booking.booking.confirmationId}
										</Badge>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Room
										</p>
										<p className="font-semibold">{booking.room.name}</p>
									</div>
								</div>

								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Check-in
										</p>
										<p className="font-semibold">
											{new Date(booking.booking.checkInDate).toLocaleDateString(
												'en-US',
												{
													weekday: 'long',
													year: 'numeric',
													month: 'long',
													day: 'numeric',
												},
											)}
										</p>
										<p className="text-sm text-muted-foreground">
											After 3:00 PM
										</p>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Check-out
										</p>
										<p className="font-semibold">
											{new Date(
												booking.booking.checkOutDate,
											).toLocaleDateString('en-US', {
												weekday: 'long',
												year: 'numeric',
												month: 'long',
												day: 'numeric',
											})}
										</p>
										<p className="text-sm text-muted-foreground">
											Before 11:00 AM
										</p>
									</div>
								</div>

								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Duration
										</p>
										<p className="font-semibold">
											{booking.booking.numberOfNights} night
											{booking.booking.numberOfNights !== 1 ? 's' : ''}
										</p>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Guests
										</p>
										<p className="font-semibold">
											{booking.booking.numberOfGuests} guest
											{booking.booking.numberOfGuests !== 1 ? 's' : ''}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Admin Information */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Settings className="w-5 h-5" />
									Admin Information
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Booking ID
										</p>
										<p className="font-mono text-sm">{booking.booking.id}</p>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											User ID
										</p>
										<p className="font-mono text-sm">
											{booking.booking.userId}
										</p>
									</div>
								</div>
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Created At
										</p>
										<p className="text-sm">
											{new Date(booking.booking.createdAt).toLocaleString()}
										</p>
									</div>
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Updated At
										</p>
										<p className="text-sm">
											{new Date(booking.booking.updatedAt).toLocaleString()}
										</p>
									</div>
								</div>
								{booking.booking.stripeCustomerId && (
									<div className="grid sm:grid-cols-2 gap-4">
										<div>
											<p className="text-sm font-medium text-muted-foreground">
												Stripe Customer ID
											</p>
											<p className="font-mono text-sm">
												{booking.booking.stripeCustomerId}
											</p>
										</div>
										{booking.booking.stripePaymentIntentId && (
											<div>
												<p className="text-sm font-medium text-muted-foreground">
													Stripe Payment Intent ID
												</p>
												<p className="font-mono text-sm">
													{booking.booking.stripePaymentIntentId}
												</p>
											</div>
										)}
									</div>
								)}
								{booking.booking.internalNotes && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Internal Notes
										</p>
										<p className="text-sm bg-yellow-50 border border-yellow-200 p-3 rounded-md">
											{booking.booking.internalNotes}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Right Column - Pricing Summary & Actions */}
					<div className="lg:col-span-1">
						<Card className="sticky top-4">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<CreditCard className="w-5 h-5" />
									Pricing Summary
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<span className="text-sm">
											$
											{(
												booking.booking.baseAmount /
												booking.booking.numberOfNights
											).toFixed(2)}{' '}
											x {booking.booking.numberOfNights} night
											{booking.booking.numberOfNights !== 1 ? 's' : ''}
										</span>
										<span className="font-medium">
											${booking.booking.baseAmount.toFixed(2)}
										</span>
									</div>

									{booking.booking.feesAmount &&
										booking.booking.feesAmount > 0 && (
											<div className="flex justify-between items-center">
												<span className="text-sm">Cleaning fee</span>
												<span className="font-medium">
													${booking.booking.feesAmount.toFixed(2)}
												</span>
											</div>
										)}

									{booking.booking.taxAmount &&
										booking.booking.taxAmount > 0 && (
											<div className="flex justify-between items-center">
												<span className="text-sm">Taxes</span>
												<span className="font-medium">
													${booking.booking.taxAmount.toFixed(2)}
												</span>
											</div>
										)}

									{booking.booking.discountAmount &&
										booking.booking.discountAmount > 0 && (
											<div className="flex justify-between items-center">
												<span className="text-sm">Discount</span>
												<span className="font-medium text-green-600">
													-${booking.booking.discountAmount.toFixed(2)}
												</span>
											</div>
										)}
								</div>

								<div className="border-t pt-3">
									<div className="flex justify-between items-center">
										<span className="font-semibold">Total</span>
										<span className="font-bold text-lg">
											${booking.booking.totalAmount.toFixed(2)}
										</span>
									</div>
								</div>

								{/* Payment Status */}
								<div className="border-t pt-3">
									<div className="flex justify-between items-center">
										<span className="text-sm font-medium">Payment Status</span>
										<Badge
											variant={
												booking.booking.paymentStatus === 'paid'
													? 'default'
													: booking.booking.paymentStatus === 'failed'
														? 'destructive'
														: 'secondary'
											}
										>
											{booking.booking.paymentStatus.toUpperCase()}
										</Badge>
									</div>
								</div>

								{/* Admin Action Buttons */}
								<div className="border-t pt-4 space-y-2">
									<Button
										onClick={handleResendEmail}
										disabled={isResendingEmail}
										variant="outline"
										className="w-full"
									>
										<Mail className="w-4 h-4 mr-2" />
										{isResendingEmail
											? 'Sending...'
											: 'Resend Confirmation Email'}
									</Button>
									<Button variant="outline" className="w-full">
										<Eye className="w-4 h-4 mr-2" />
										View Customer Profile
									</Button>
									<Button variant="outline" className="w-full">
										<Settings className="w-4 h-4 mr-2" />
										Edit Booking
									</Button>
									<Link to="/admin/bookings" className="block">
										<Button variant="outline" className="w-full">
											Back to All Bookings
										</Button>
									</Link>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
