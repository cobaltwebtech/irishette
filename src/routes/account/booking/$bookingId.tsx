import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Calendar, CreditCard, Mail, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/auth-client';

// Interface for detailed booking data
interface BookingDetailData {
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

export const Route = createFileRoute('/account/booking/$bookingId')({
	head: () => ({
		meta: [
			{
				title: 'Booking Details | Irishette.com',
			},
		],
	}),
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const params = Route.useParams() as { bookingId: string };
	const bookingId = params.bookingId;
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const [booking, setBooking] = useState<BookingDetailData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isResendingEmail, setIsResendingEmail] = useState(false);

	// Redirect if not logged in
	useEffect(() => {
		if (!isPending && !session) {
			router.navigate({ to: '/login' });
		}
	}, [session, isPending, router]);

	// Fetch booking details
	useEffect(() => {
		const fetchBookingDetails = async () => {
			if (!session?.user?.id || !bookingId) return;

			try {
				setIsLoading(true);
				setError(null);

				console.log('Fetching booking details for:', {
					bookingId,
					userId: session.user.id,
				});

				const response = await fetch('/api/trpc/bookings.getBooking', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						bookingId: bookingId,
						userId: session.user.id,
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
						data?: BookingDetailData;
					};
				};

				console.log('Received result:', result);

				const bookingData = result.result?.data;

				if (!bookingData) {
					throw new Error('Booking not found');
				}

				// Verify that the booking belongs to the current user
				if (bookingData.booking.userId !== session.user.id) {
					throw new Error('Access denied: This booking does not belong to you');
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

		if (session?.user?.id) {
			fetchBookingDetails();
		}
	}, [session?.user?.id, bookingId]);

	// Handle resending confirmation email
	const handleResendEmail = async () => {
		if (!booking?.booking || !session?.user?.id) return;

		setIsResendingEmail(true);

		try {
			console.log(
				'Resending confirmation email for booking:',
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
						result.message ||
						'Confirmation email has been sent to your email address.',
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

	if (!session) {
		return null; // Will redirect via useEffect
	}

	if (error || (!isLoading && !booking)) {
		return (
			<div className="min-h-screen bg-background">
				<div className="bg-primary/5 border-b">
					<div className="container mx-auto px-4 py-6">
						<div className="flex items-center gap-4">
							<Link
								to="/account"
								className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back to Account
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
								<Link to="/account">
									<Button>Back to Account</Button>
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
								to="/account"
								className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back to Account
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
							<Link to="/account">
								<Button>Back to Account</Button>
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
								<Link to="/account">
									<ArrowLeft className="w-4 h-4 mr-2" />
									Back to Account
								</Link>
							</Button>
							<div>
								<h1 className="text-2xl font-bold text-foreground">
									Booking Details
								</h1>
							</div>
						</div>
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
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Left Column - Booking Details */}
					<div className="lg:col-span-2 space-y-6">
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
											Confirmation ID:
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

						{/* Guest Information */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<User className="w-5 h-5" />
									Guest Information
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid sm:grid-cols-2 gap-4">
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Name
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

						{/* Important Information */}
						<Card>
							<CardHeader>
								<CardTitle>Important Information</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-3 text-sm">
									<div className="flex items-start gap-2">
										<div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
										<p>
											Check-in is available from 3:00 PM. Early check-in may be
											available upon request.
										</p>
									</div>
									<div className="flex items-start gap-2">
										<div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
										<p>
											Check-out is by 11:00 AM. Late check-out may be available
											upon request.
										</p>
									</div>
									<div className="flex items-start gap-2">
										<div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
										<p>Please bring a valid photo ID for check-in.</p>
									</div>
									<div className="flex items-start gap-2">
										<div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
										<p>
											If you have any questions or need assistance, please
											contact us.
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Right Column - Pricing Summary */}
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
												<span className="text-sm">Service Fee</span>
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
													? 'accent'
													: booking.booking.paymentStatus === 'failed'
														? 'destructive'
														: 'secondary'
											}
										>
											{booking.booking.paymentStatus.toUpperCase()}
										</Badge>
									</div>
								</div>

								{/* Action Buttons */}
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
									<Button className="w-full">Contact Support</Button>
									<Link to="/" className="block">
										<Button variant="outline" className="w-full">
											Book Another Stay
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
