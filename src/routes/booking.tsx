import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, LoaderCircle, User } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { signIn, updateUser, useSession } from '@/lib/auth-client';
import { type BookingStep, useBookingStore } from '@/stores';

// Helper function to create a date from YYYY-MM-DD string without timezone conversion
function parseISODateString(dateString: string): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day); // month is 0-indexed
}

export const Route = createFileRoute('/booking')({
	head: () => ({
		meta: [
			{
				title: 'Book Your Stay | Irishette.com',
			},
		],
	}),
	component: BookingFlow,
});

function BookingFlow() {
	const { data: session } = useSession();
	const booking = useBookingStore();
	const [isHydrated, setIsHydrated] = useState(false);

	// Handle hydration
	useEffect(() => {
		setIsHydrated(true);
	}, []);

	// Handle URL parameters for step navigation
	useEffect(() => {
		if (!isHydrated) return; // Wait for hydration

		const urlParams = new URLSearchParams(window.location.search);
		const stepParam = urlParams.get('step');

		if (
			stepParam &&
			['dates', 'auth', 'details', 'confirmation'].includes(stepParam)
		) {
			booking.actions.setStep(stepParam as BookingStep);
		}
	}, [booking.actions, isHydrated]);

	// Calculate precise pricing when booking data is available
	// We intentionally don't include booking.actions.setPricing in dependencies to avoid infinite loop
	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally excluding setPricing to prevent infinite loop
	useEffect(() => {
		if (!isHydrated) return; // Wait for hydration

		const calculatePrecisePricing = async () => {
			if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
				console.log(
					'Missing booking data, skipping precise pricing calculation',
				);
				return;
			}

			try {
				console.log('Calculating precise pricing for booking summary...');
				const pricingData = await trpcClient.bookings.calculateBooking.mutate({
					roomId: booking.roomId,
					checkInDate: booking.checkInDate,
					checkOutDate: booking.checkOutDate,
					guestCount: booking.guestCount || 1,
				});

				console.log('Extracted pricing data:', pricingData);

				// Validate that we have the expected data structure
				if (
					!pricingData.baseAmount ||
					!pricingData.feesAmount ||
					!pricingData.taxAmount ||
					!pricingData.numberOfNights ||
					!pricingData.totalAmount
				) {
					console.error('Invalid pricing data structure:', pricingData);
					return;
				}

				console.log(
					'Updating booking summary with precise pricing:',
					pricingData,
				);

				// Update the booking store with the precise pricing
				booking.actions.setPricing({
					basePrice: pricingData.baseAmount / pricingData.numberOfNights,
					nights: pricingData.numberOfNights,
					subtotal: pricingData.baseAmount,
					taxes: pricingData.taxAmount,
					fees: pricingData.feesAmount,
					totalAmount: pricingData.totalAmount,
					currency: 'USD',
					// Include enhanced pricing information
					appliedRules: pricingData.appliedRules || [],
					taxBreakdown: pricingData.taxBreakdown,
				});
			} catch (error) {
				console.error('Error calculating precise pricing:', error);
			}
		};

		calculatePrecisePricing();
	}, [
		isHydrated,
		booking.roomId,
		booking.checkInDate,
		booking.checkOutDate,
		booking.guestCount,
	]);

	// Handle authentication callback - if user just logged in, advance to details step
	useEffect(() => {
		if (session?.user && booking.currentStep === 'auth') {
			// User has successfully authenticated, advance to details step
			booking.actions.setStep('details');
		}
	}, [session, booking.currentStep, booking.actions]);

	// Wait for hydration before checking booking state
	if (!isHydrated) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	// If no active booking, redirect to home
	if (!booking.hasActiveBooking()) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Card className="max-w-md mx-auto">
					<CardHeader>
						<CardTitle className="text-center">No Active Booking</CardTitle>
					</CardHeader>
					<CardContent className="text-center space-y-4">
						<p className="text-muted-foreground">
							It looks like you don't have an active booking session.
						</p>
						<Link to="/">
							<Button>Browse Rooms</Button>
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="border-b bg-white">
				<div className="container mx-auto max-w-4xl px-4 py-4">
					<div className="flex items-center justify-between">
						<Link
							to={
								booking.roomSlug === 'rose-room'
									? '/rooms/rose-room'
									: '/rooms/texas-room'
							}
							className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="w-4 h-4 mr-2" />
							Back to Room
						</Link>
						<div className="text-sm text-muted-foreground">
							Booking: {booking.roomSlug}
						</div>
					</div>
				</div>
			</div>

			{/* Progress Steps */}
			<div className="bg-muted/20 border-b">
				<div className="container mx-auto max-w-4xl px-4 py-6">
					<div className="flex items-center justify-between">
						{[
							{
								step: 'dates',
								label: 'Dates',
								completed: booking.isValid.dates,
							},
							{ step: 'auth', label: 'Sign In', completed: !!session?.user },
							{
								step: 'details',
								label: 'Details',
								completed: booking.isValid.details,
							},
							{
								step: 'confirmation',
								label: 'Confirmed',
								completed: booking.isStep('confirmation'),
							},
						].map((item, index) => (
							<div key={item.step} className="flex items-center">
								<div
									className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
										item.completed || booking.isStep(item.step as BookingStep)
											? 'bg-primary border-primary text-primary-foreground'
											: 'bg-background border-muted-foreground text-muted-foreground'
									}`}
								>
									{item.completed ? (
										<Check className="w-4 h-4" />
									) : (
										<span className="text-sm font-medium">{index + 1}</span>
									)}
								</div>
								<span
									className={`ml-2 text-sm font-medium ${
										item.completed || booking.isStep(item.step as BookingStep)
											? 'text-foreground'
											: 'text-muted-foreground'
									}`}
								>
									{item.label}
								</span>
								{index < 3 && (
									<div
										className={`w-8 h-0.5 ml-4 ${
											item.completed ? 'bg-primary' : 'bg-muted'
										}`}
									/>
								)}
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto max-w-4xl px-4 py-8">
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Booking Steps */}
					<div className="lg:col-span-2">
						{booking.isStep('dates') && <DatesStep />}
						{booking.isStep('auth') && <AuthenticationStep />}
						{booking.isStep('details') && <BookingDetailsStep />}
						{booking.isStep('confirmation') && <ConfirmationStep />}
					</div>

					{/* Booking Summary Sidebar */}
					<div className="lg:col-span-1">
						<BookingSummary />
					</div>
				</div>
			</div>
		</div>
	);
}

// Step 1: Dates (shouldn't normally be reached, but good fallback)
function DatesStep() {
	const booking = useBookingStore();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Select Your Dates</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground mb-4">
					Please go back to select your dates and room.
				</p>
				<Link
					to={
						booking.roomSlug === 'rose-room'
							? '/rooms/rose-room'
							: '/rooms/texas-room'
					}
				>
					<Button>Back to Room Selection</Button>
				</Link>
			</CardContent>
		</Card>
	);
}

// Step 2: Authentication
function AuthenticationStep() {
	const booking = useBookingStore();
	const { data: session } = useSession();
	const [email, setEmail] = useState('');
	const [emailSent, setEmailSent] = useState(false);
	const [loading, setLoading] = useState(false);

	if (session?.user) {
		// User is already authenticated, advance to next step
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Check className="w-5 h-5 text-green-600" />
						Welcome back, {session.user.name || session.user.email}!
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground mb-4">
						You're signed in and ready to continue with your booking.
					</p>
					<Button onClick={() => booking.actions.setStep('details')}>
						Continue to Booking Details
					</Button>
				</CardContent>
			</Card>
		);
	}

	const handleSendMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email || loading) return;

		setLoading(true);
		try {
			// Send magic link using Better Auth client-side API
			const { error } = await signIn.magicLink({
				email: email,
				callbackURL: '/booking', // Redirect back to booking after authentication
				newUserCallbackURL: '/booking', // Also redirect new users to booking
				errorCallbackURL: '/booking?error=auth', // Handle errors gracefully
			});

			if (error) {
				throw new Error(error.message || 'Failed to send magic link');
			}

			setEmailSent(true);
		} catch (error) {
			console.error('Error sending magic link:', error);
			alert('Failed to send magic link. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	if (emailSent) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Check Your Email</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground mb-4">
						We've sent a magic link to <strong>{email}</strong>. Click the link
						in your email to continue with your booking.
					</p>
					<p className="text-sm text-muted-foreground">
						Don't see the email? Check your spam folder or{' '}
						<button
							type="button"
							onClick={() => setEmailSent(false)}
							className="text-primary hover:underline"
						>
							try a different email address
						</button>
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign In to Continue</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground mb-4">
					We'll send you a magic link to continue with your booking. No password
					required!
				</p>
				<form onSubmit={handleSendMagicLink} className="space-y-4">
					<div>
						<Input
							type="email"
							placeholder="Enter your email address"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<Button type="submit" disabled={loading || !email} className="w-full">
						{loading ? 'Sending...' : 'Send Magic Link'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

// Step 3: Booking Details
function BookingDetailsStep() {
	const booking = useBookingStore();
	const { data: session } = useSession();
	const nameId = useId();
	const emailId = useId();
	const phoneId = useId();
	const guestsId = useId();
	const requestsId = useId();

	// Form state
	const [guestName, setGuestName] = useState(session?.user?.name || '');
	const [guestEmail, setGuestEmail] = useState(session?.user?.email || '');
	const [guestPhone, setGuestPhone] = useState('');
	const [numberOfGuests, setNumberOfGuests] = useState(booking.guestCount || 1);
	const [specialRequests, setSpecialRequests] = useState('');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Pre-populate form with session data or existing booking data
	useEffect(() => {
		if (session?.user) {
			setGuestName(session.user.name || '');
			setGuestEmail(session.user.email || '');
		}

		// Pre-populate with existing guest info if available
		if (booking.guestInfo) {
			setGuestName(booking.guestInfo.name || '');
			setGuestEmail(booking.guestInfo.email || '');
			setGuestPhone(booking.guestInfo.phone || '');
			setSpecialRequests(booking.guestInfo.specialRequests || '');
		}
	}, [session, booking.guestInfo]);

	const validateForm = () => {
		const newErrors: Record<string, string> = {};

		if (!guestName.trim()) {
			newErrors.guestName = 'Guest name is required';
		}

		if (!guestEmail.trim()) {
			newErrors.guestEmail = 'Email is required';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
			newErrors.guestEmail = 'Please enter a valid email address';
		}

		if (numberOfGuests < 1) {
			newErrors.numberOfGuests = 'At least 1 guest is required';
		}

		if (!guestPhone.trim()) {
			newErrors.guestPhone = 'Phone number is required';
		} else if (guestPhone.length < 10) {
			newErrors.guestPhone =
				'Please enter a valid phone number (at least 10 digits)';
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleContinue = async () => {
		if (!validateForm()) {
			return;
		}

		// Update user's name in Better Auth if it's different and user is logged in
		if (session?.user && guestName.trim() !== session.user.name) {
			try {
				await updateUser({
					name: guestName.trim(),
				});
				console.log('User name updated in Better Auth:', guestName.trim());
			} catch (error) {
				console.warn('Failed to update user name in Better Auth:', error);
				// Don't block the booking flow if user update fails
			}
		}

		// Update booking store with guest details using existing action
		booking.actions.setGuestInfo({
			name: guestName,
			email: guestEmail,
			phone: guestPhone,
			specialRequests: specialRequests || undefined,
		});

		// Update guest count if changed
		if (numberOfGuests !== booking.guestCount) {
			booking.actions.setGuestCount(numberOfGuests);
		}

		// Calculate real pricing with fees and taxes before proceeding to payment
		try {
			if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
				throw new Error('Missing required booking information');
			}

			console.log('Calculating precise pricing with fees and taxes...');
			console.log('Request data:', {
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: numberOfGuests,
			});

			// Always calculate precise pricing using PaymentService, don't use estimated pricing
			const pricingData = await trpcClient.bookings.calculateBooking.mutate({
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: numberOfGuests,
			});

			console.log('Raw response data (handleContinue):', pricingData);

			// Handle TRPC response format which might be nested under result.data
			console.log('Extracted pricing data (handleContinue):', pricingData);

			// Validate that we have the expected data structure
			if (
				!pricingData.baseAmount ||
				!pricingData.feesAmount ||
				!pricingData.taxAmount ||
				!pricingData.numberOfNights ||
				!pricingData.totalAmount
			) {
				console.error(
					'Invalid pricing data structure in handleContinue:',
					pricingData,
				);
				return;
			}

			console.log('Received pricing data:', pricingData);

			// Update the booking store with the detailed pricing
			booking.actions.setPricing({
				basePrice: pricingData.baseAmount / pricingData.numberOfNights, // Per night rate
				nights: pricingData.numberOfNights,
				subtotal: pricingData.baseAmount,
				taxes: pricingData.taxAmount,
				fees: pricingData.feesAmount,
				totalAmount: pricingData.totalAmount,
				currency: 'USD',
				// Include enhanced pricing information
				appliedRules: pricingData.appliedRules || [],
				taxBreakdown: pricingData.taxBreakdown,
			});

			console.log('Updated pricing with detailed breakdown:', pricingData);
		} catch (error) {
			console.error('Failed to calculate detailed pricing:', error);
			console.log('Current booking pricing fallback:', booking.pricing);

			// If we have no pricing at all, show an error
			if (!booking.pricing || !booking.pricing.totalAmount) {
				console.warn(
					'No pricing data available, this may cause display issues',
				);
				// Optionally set a basic pricing structure to prevent UI errors
				booking.actions.setPricing({
					basePrice: 0,
					nights: 0,
					subtotal: 0,
					taxes: 0,
					fees: 0,
					totalAmount: 0,
					currency: 'USD',
					appliedRules: [],
					taxBreakdown: undefined,
				});
			}
		}

		// Proceed to payment step
		await initiatePayment();
	};

	// Function to handle payment initiation
	const initiatePayment = async () => {
		if (!session?.user) {
			booking.actions.setError('Please sign in to continue with payment');
			return;
		}

		if (!booking.guestInfo || !booking.pricing) {
			booking.actions.setError('Missing booking information');
			return;
		}

		if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
			booking.actions.setError('Missing booking dates or room information');
			return;
		}

		setIsSubmitting(true);
		booking.actions.clearError();

		try {
			// Prepare booking data for creation
			const bookingData = {
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: booking.guestCount,
				guestName: booking.guestInfo.name,
				guestEmail: booking.guestInfo.email,
				guestPhone: booking.guestInfo.phone,
				specialRequests: booking.guestInfo.specialRequests || '',
				basePrice: booking.pricing.basePrice,
				serviceFee: booking.pricing.fees || 0,
				taxAmount: booking.pricing.taxes || 0,
				totalAmount: booking.pricing.totalAmount,
				userId: session.user.id,
			};

			// Step 1: Create booking via tRPC
			console.log('Creating booking...', bookingData);
			const createBookingResult =
				await trpcClient.bookings.createBooking.mutate(bookingData);
			console.log('Booking created:', createBookingResult);

			if (!createBookingResult?.bookingId) {
				throw new Error('No booking ID returned from server');
			}

			const bookingId = createBookingResult.bookingId;
			booking.actions.setBookingId(bookingId);

			// Step 2: Create Stripe checkout session
			console.log('Creating checkout session...');
			const checkoutData = {
				bookingId: bookingId,
				userId: session.user.id,
				successUrl: `${window.location.origin}/booking?step=confirmation`,
				cancelUrl: `${window.location.origin}/booking?step=details`,
			};

			const checkoutResult =
				await trpcClient.bookings.createCheckoutSession.mutate(checkoutData);
			console.log('Checkout session created:', checkoutResult);

			// Step 3: Redirect to Stripe checkout
			if (checkoutResult?.checkoutUrl) {
				console.log(
					'Redirecting to Stripe checkout:',
					checkoutResult.checkoutUrl,
				);
				window.location.href = checkoutResult.checkoutUrl;
			} else {
				throw new Error('No checkout URL returned from server');
			}
		} catch (error) {
			console.error('Payment processing error:', error);
			booking.actions.setError(
				error instanceof Error
					? error.message
					: 'An error occurred while processing your payment',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<User className="w-5 h-5" />
					Booking Details
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Guest Information */}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Guest Information</h3>

					<div className="grid sm:grid-cols-2 gap-4">
						{/* Guest Name */}
						<div className="space-y-2">
							<label htmlFor={nameId} className="text-sm font-medium">
								Full Name *
							</label>
							<Input
								id={nameId}
								type="text"
								placeholder="Enter your full name"
								value={guestName}
								onChange={(e) => setGuestName(e.target.value)}
								className={errors.guestName ? 'border-red-500' : ''}
							/>
							{errors.guestName && (
								<p className="text-sm text-red-600">{errors.guestName}</p>
							)}
						</div>

						{/* Guest Email */}
						<div className="space-y-2">
							<label htmlFor={emailId} className="text-sm font-medium">
								Email Address *
							</label>
							<Input
								id={emailId}
								type="email"
								placeholder="Enter your email"
								value={guestEmail}
								onChange={(e) => setGuestEmail(e.target.value)}
								className={errors.guestEmail ? 'border-red-500' : ''}
							/>
							{errors.guestEmail && (
								<p className="text-sm text-red-600">{errors.guestEmail}</p>
							)}
						</div>
					</div>

					<div className="grid sm:grid-cols-2 gap-4">
						{/* Guest Phone */}
						<div className="space-y-2">
							<label htmlFor={phoneId} className="text-sm font-medium">
								Phone Number *
							</label>
							<Input
								id={phoneId}
								type="tel"
								placeholder="Enter your phone number"
								value={guestPhone}
								onChange={(e) => setGuestPhone(e.target.value)}
								className={errors.guestPhone ? 'border-red-500' : ''}
							/>
							{errors.guestPhone && (
								<p className="text-sm text-red-600">{errors.guestPhone}</p>
							)}
						</div>

						{/* Number of Guests */}
						<div className="space-y-2">
							<label htmlFor={guestsId} className="text-sm font-medium">
								Number of Guests *
							</label>
							<Input
								id={guestsId}
								type="number"
								min="1"
								max="4"
								value={numberOfGuests}
								onChange={(e) =>
									setNumberOfGuests(parseInt(e.target.value) || 1)
								}
								className={errors.numberOfGuests ? 'border-red-500' : ''}
							/>
							{errors.numberOfGuests && (
								<p className="text-sm text-red-600">{errors.numberOfGuests}</p>
							)}
						</div>
					</div>
				</div>

				{/* Special Requests */}
				<div className="space-y-2">
					<label htmlFor={requestsId} className="text-sm font-medium">
						Special Requests
					</label>
					<textarea
						id={requestsId}
						placeholder="Any special requests or notes for your stay? (optional)"
						value={specialRequests}
						onChange={(e) => setSpecialRequests(e.target.value)}
						rows={3}
						className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">
						Examples: dietary restrictions, accessibility needs, early
						check-in/late check-out requests, etc.
					</p>
				</div>

				{/* Summary */}
				<div className="bg-muted/50 rounded-lg p-4 space-y-2">
					<h4 className="font-medium">Booking Summary</h4>
					<div className="text-sm space-y-1">
						<p>
							<span className="font-medium">Room:</span>{' '}
							{booking.roomSlug
								?.replace('-', ' ')
								.replace(/\b\w/g, (l) => l.toUpperCase())}
						</p>
						<p>
							<span className="font-medium">Check-in:</span>{' '}
							{booking.checkInDate}
						</p>
						<p>
							<span className="font-medium">Check-out:</span>{' '}
							{booking.checkOutDate}
						</p>
						<p>
							<span className="font-medium">Guests:</span> {numberOfGuests}
						</p>
						<p>
							<span className="font-medium">Total:</span> $
							{booking.pricing?.totalAmount?.toFixed(2) || '0.00'}
						</p>
					</div>
				</div>

				{/* Error Display */}
				{booking.error && (
					<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
						<p className="text-sm text-destructive">{booking.error}</p>
					</div>
				)}

				{/* Continue Button */}
				<div className="flex gap-3">
					<Button
						variant="outline"
						onClick={() => booking.actions.setStep('auth')}
						className="flex-1"
						disabled={isSubmitting}
					>
						Back
					</Button>
					<Button
						onClick={handleContinue}
						className="flex-1"
						disabled={isSubmitting}
					>
						{isSubmitting ? (
							<>
								<LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
								Processing...
							</>
						) : (
							'Continue to Payment'
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// Step 4: Confirmation
function ConfirmationStep() {
	const booking = useBookingStore();
	const summary = booking.summary;
	const [confirmationId, setConfirmationId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch booking details to get confirmation ID
	useEffect(() => {
		const fetchBookingDetails = async () => {
			if (!booking.bookingId) {
				setIsLoading(false);
				return;
			}

			try {
				const result = await trpcClient.bookings.getBooking.query({
					bookingId: booking.bookingId,
				});

				if (result?.booking?.confirmationId) {
					setConfirmationId(result.booking.confirmationId);
				}
			} catch (error) {
				console.error('Failed to fetch booking details:', error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchBookingDetails();
	}, [booking.bookingId]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Check className="w-5 h-5 text-green-600" />
					Booking Confirmed!
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="bg-green-50 border border-green-200 rounded-lg p-4">
					<p className="text-green-800 font-medium">
						🎉 Your reservation has been confirmed!
					</p>
					<p className="text-green-700 text-sm mt-1">
						You'll receive a confirmation email shortly with all the details.
					</p>
				</div>

				{summary && (
					<div className="space-y-4">
						{/* Booking Details */}
						<div>
							<h3 className="font-semibold text-lg mb-3">
								Reservation Details
							</h3>

							<div className="grid gap-3">
								{confirmationId && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">
											Confirmation ID:
										</span>
										<Badge
											variant="outline"
											className="font-bold font-mono text-sm tracking-wider"
										>
											{isLoading ? '...' : confirmationId}
										</Badge>
									</div>
								)}

								<div className="flex justify-between">
									<span className="text-muted-foreground">Room:</span>
									<span className="font-medium capitalize">
										{summary.roomSlug.replace('-', ' ')}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-in:</span>
									<span className="font-medium">
										{parseISODateString(summary.checkInDate).toLocaleDateString(
											'en-US',
											{
												weekday: 'long',
												year: 'numeric',
												month: 'long',
												day: 'numeric',
											},
										)}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-out:</span>
									<span className="font-medium">
										{parseISODateString(
											summary.checkOutDate,
										).toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Duration:</span>
									<span className="font-medium">
										{summary.totalNights} night
										{summary.totalNights !== 1 ? 's' : ''}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Guests:</span>
									<span className="font-medium">
										{summary.guestCount} guest
										{summary.guestCount !== 1 ? 's' : ''}
									</span>
								</div>
							</div>
						</div>

						{/* Guest Information */}
						{booking.guestInfo && (
							<div className="border-t pt-4">
								<h4 className="font-semibold mb-3">Guest Information</h4>
								<div className="grid gap-2">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Name:</span>
										<span className="font-medium">
											{booking.guestInfo.name}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Email:</span>
										<span className="font-medium">
											{booking.guestInfo.email}
										</span>
									</div>
									{booking.guestInfo.phone && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Phone:</span>
											<span className="font-medium">
												{booking.guestInfo.phone}
											</span>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Pricing Summary */}
						{summary.pricing && (
							<div className="border-t pt-4">
								<h4 className="font-semibold mb-3">Payment Summary</h4>
								<div className="grid gap-2">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Base Rate:</span>
										<span>${summary.pricing.basePrice.toFixed(2)}/night</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Subtotal:</span>
										<span>${summary.pricing.subtotal.toFixed(2)}</span>
									</div>
									{summary.pricing.fees > 0 && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Fees:</span>
											<span>${summary.pricing.fees.toFixed(2)}</span>
										</div>
									)}
									{summary.pricing.taxes > 0 && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Taxes:</span>
											<span>${summary.pricing.taxes.toFixed(2)}</span>
										</div>
									)}
									<div className="flex justify-between font-semibold text-lg border-t pt-2">
										<span>Total Paid:</span>
										<span>${summary.pricing.totalAmount.toFixed(2)}</span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Next Steps */}
				<div className="border-t pt-4">
					<h4 className="font-semibold mb-3">What's Next?</h4>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li>• Check your email for the confirmation details</li>
						<li>• Save this confirmation for your records</li>
						<li>• Contact us if you have any questions</li>
						<li>• We look forward to hosting you!</li>
					</ul>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-4 pt-4">
					<Button
						onClick={() => booking.actions.reset()}
						variant="outline"
						className="flex-1"
					>
						New Booking
					</Button>
					<Link to="/" className="flex-1">
						<Button className="w-full">Back to Home</Button>
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

// Booking Summary Sidebar
function BookingSummary() {
	const booking = useBookingStore();
	const summary = booking.summary;

	if (!summary) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Booking Summary</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">
						No booking information available.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="sticky top-4">
			<CardHeader>
				<CardTitle>Booking Summary</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Room */}
				<div>
					<h4 className="font-semibold capitalize">
						{summary.roomSlug.replace('-', ' ')}
					</h4>
					<p className="text-sm text-muted-foreground">
						{summary.guestCount} guest{summary.guestCount !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Dates */}
				<div>
					<h4 className="font-semibold">Dates</h4>
					<p className="text-sm text-muted-foreground">
						Check-in:{' '}
						{parseISODateString(summary.checkInDate).toLocaleDateString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Check-out:{' '}
						{parseISODateString(summary.checkOutDate).toLocaleDateString()}
					</p>
					<p className="text-sm text-muted-foreground">
						{summary.totalNights} night{summary.totalNights !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Pricing */}
				{summary.pricing && (
					<div className="border-t pt-4">
						<div className="flex items-center justify-between mb-2">
							<h4 className="font-semibold">Pricing Breakdown</h4>
							{booking.currentStep !== 'payment' &&
								booking.currentStep !== 'confirmation' && (
									<span className="text-xs text-muted-foreground">
										Estimated
									</span>
								)}
						</div>
						<div className="space-y-1 text-sm">
							<div className="flex justify-between">
								<span>
									${summary.pricing.basePrice?.toFixed(2) || '0.00'} ×{' '}
									{summary.totalNights} nights
								</span>
								<span>${summary.pricing.subtotal?.toFixed(2) || '0.00'}</span>
							</div>

							{summary.pricing.fees && summary.pricing.fees > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Service Fee</span>
									<span>${summary.pricing.fees.toFixed(2)}</span>
								</div>
							)}

							{/* Enhanced tax display */}
							{summary.pricing.taxes && summary.pricing.taxes > 0 && (
								<div className="space-y-1">
									<div className="flex justify-between text-muted-foreground">
										<span>Hotel Occupancy Tax</span>
										<span>${summary.pricing.taxes.toFixed(2)}</span>
									</div>
									{summary.pricing.taxBreakdown && (
										<div className="ml-2 space-y-1 text-xs text-muted-foreground">
											<div className="flex justify-between">
												<span>
													• State of Texas (
													{(
														summary.pricing.taxBreakdown.stateTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{summary.pricing.taxBreakdown.stateTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
											<div className="flex justify-between">
												<span>
													• City of Dublin (
													{(
														summary.pricing.taxBreakdown.cityTaxRate * 100
													).toFixed(0)}
													%)
												</span>
												<span>
													$
													{summary.pricing.taxBreakdown.cityTaxAmount.toFixed(
														2,
													)}
												</span>
											</div>
										</div>
									)}
								</div>
							)}

							<div className="flex justify-between font-semibold border-t pt-2 mt-2 text-base">
								<span>Total</span>
								<span>
									${summary.pricing.totalAmount?.toFixed(2) || '0.00'}
								</span>
							</div>
						</div>
					</div>
				)}

				{/* Guest Info */}
				{booking.guestInfo && (
					<div className="border-t pt-4">
						<h4 className="font-semibold mb-2">Guest Information</h4>
						<div className="space-y-1 text-sm">
							<p>{booking.guestInfo.name}</p>
							<p className="text-muted-foreground">{booking.guestInfo.email}</p>
							{booking.guestInfo.phone && (
								<p className="text-muted-foreground">
									{booking.guestInfo.phone}
								</p>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
