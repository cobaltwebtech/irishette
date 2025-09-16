import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, CreditCard, LoaderCircle, User } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { signIn, updateUser, useSession } from '@/lib/auth-client';
import {
	type BillingAddress,
	type BookingStep,
	useBookingStore,
} from '@/stores';

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
			['dates', 'auth', 'details', 'payment', 'confirmation'].includes(
				stepParam,
			)
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
				const response = await fetch('/api/trpc/bookings.calculateBooking', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						roomId: booking.roomId,
						checkInDate: booking.checkInDate,
						checkOutDate: booking.checkOutDate,
						guestCount: booking.guestCount || 1,
					}),
				});

				if (!response.ok) {
					console.error(
						'Failed to calculate precise pricing:',
						response.status,
					);
					return;
				}

				const responseData = (await response.json()) as {
					result?: {
						data?: {
							baseAmount: number;
							feesAmount: number;
							taxAmount: number;
							totalAmount: number;
							numberOfNights: number;
						};
					};
					baseAmount?: number;
					feesAmount?: number;
					taxAmount?: number;
					totalAmount?: number;
					numberOfNights?: number;
				};
				console.log('Raw response data:', responseData);

				// Handle TRPC response format which might be nested under result.data
				const pricingData = responseData.result?.data || responseData;

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
								booking.roomSlug === 'rose-room' ? '/rose-room' : '/texas-room'
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
							{ step: 'payment', label: 'Payment', completed: false },
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
								{index < 4 && (
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
						{booking.isStep('payment') && <PaymentStep />}
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
					to={booking.roomSlug === 'rose-room' ? '/rose-room' : '/texas-room'}
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
			console.log('Calculating precise pricing with fees and taxes...');
			console.log('Request data:', {
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: numberOfGuests,
			});

			// Always calculate precise pricing using PaymentService, don't use estimated pricing
			const response = await fetch('/api/trpc/bookings.calculateBooking', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					roomId: booking.roomId,
					checkInDate: booking.checkInDate,
					checkOutDate: booking.checkOutDate,
					guestCount: numberOfGuests,
				}),
			});

			console.log('Response status:', response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('API Error:', errorText);
				throw new Error(
					`Failed to calculate pricing: ${response.status} ${errorText}`,
				);
			}

			const responseData = (await response.json()) as {
				result?: {
					data?: {
						baseAmount: number;
						feesAmount: number;
						taxAmount: number;
						totalAmount: number;
						numberOfNights: number;
					};
				};
				baseAmount?: number;
				feesAmount?: number;
				taxAmount?: number;
				totalAmount?: number;
				numberOfNights?: number;
			};

			console.log('Raw response data (handleContinue):', responseData);

			// Handle TRPC response format which might be nested under result.data
			const pricingData = responseData.result?.data || responseData;

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
				});
			}
		}

		// Proceed to payment step
		booking.actions.setStep('payment');
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

				{/* Continue Button */}
				<div className="flex gap-3">
					<Button
						variant="outline"
						onClick={() => booking.actions.setStep('auth')}
						className="flex-1"
					>
						Back
					</Button>
					<Button onClick={handleContinue} className="flex-1">
						Continue to Payment
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// Step 4: Payment
function PaymentStep() {
	const { data: session } = useSession();
	const booking = useBookingStore();

	// Form state for billing address
	const [billingAddress, setBillingAddress] = useState<BillingAddress>({
		line1: '',
		line2: '',
		city: '',
		state: '',
		postalCode: '',
		country: 'US', // Default to US
	});

	// Form validation errors
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Form IDs for accessibility
	const line1Id = useId();
	const line2Id = useId();
	const cityId = useId();
	const stateId = useId();
	const postalCodeId = useId();
	const countryId = useId();

	// Load existing billing address if available
	useEffect(() => {
		if (booking.billingAddress) {
			setBillingAddress(booking.billingAddress);
		}
	}, [booking.billingAddress]);

	// Validate form fields
	const validateForm = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!billingAddress.line1.trim()) {
			newErrors.line1 = 'Address line 1 is required';
		}

		if (!billingAddress.city.trim()) {
			newErrors.city = 'City is required';
		}

		if (!billingAddress.state.trim()) {
			newErrors.state = 'State/Province is required';
		}

		if (!billingAddress.postalCode.trim()) {
			newErrors.postalCode = 'Postal code is required';
		}

		if (!billingAddress.country.trim()) {
			newErrors.country = 'Country is required';
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	// Check if form is valid for submission
	const isFormValid = () => {
		return !!(
			billingAddress.line1.trim() &&
			billingAddress.city.trim() &&
			billingAddress.state.trim() &&
			billingAddress.postalCode.trim() &&
			billingAddress.country.trim()
		);
	};

	// Handle form submission
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validateForm()) {
			return;
		}

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
			// Save billing address to store
			booking.actions.setBillingAddress(billingAddress);

			// Prepare booking data for creation
			const bookingData = {
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: booking.guestCount,
				guestName: booking.guestInfo.name,
				guestEmail: booking.guestInfo.email,
				guestPhone: booking.guestInfo.phone,
				billingAddress: billingAddress,
				specialRequests: booking.guestInfo.specialRequests || '',
				basePrice: booking.pricing.basePrice,
				cleaningFee: booking.pricing.fees || 0,
				serviceFee: 0, // Could be included in fees
				taxAmount: booking.pricing.taxes || 0,
				totalAmount: booking.pricing.totalAmount,
				userId: session.user.id,
			};

			// Step 1: Create booking via TRPC
			console.log('Creating booking...', bookingData);
			const createBookingResponse = await fetch(
				'/api/trpc/bookings.createBooking',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(bookingData),
				},
			);

			if (!createBookingResponse.ok) {
				const errorData = await createBookingResponse.text();
				throw new Error(`Failed to create booking: ${errorData}`);
			}

			const createBookingResult = (await createBookingResponse.json()) as {
				result?: {
					data?: {
						bookingId?: string;
						success?: boolean;
					};
				};
			};
			console.log('Booking created:', createBookingResult);

			if (!createBookingResult.result?.data?.bookingId) {
				throw new Error('No booking ID returned from server');
			}

			const bookingId = createBookingResult.result.data.bookingId;
			booking.actions.setBookingId(bookingId);

			// Step 2: Create Stripe checkout session
			console.log('Creating checkout session...');
			const checkoutData = {
				bookingId: bookingId,
				userId: session.user.id,
				successUrl: `${window.location.origin}/booking?step=confirmation`,
				cancelUrl: `${window.location.origin}/booking?step=payment`,
			};

			const checkoutResponse = await fetch(
				'/api/trpc/bookings.createCheckoutSession',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(checkoutData),
				},
			);

			if (!checkoutResponse.ok) {
				const errorData = await checkoutResponse.text();
				throw new Error(`Failed to create checkout session: ${errorData}`);
			}

			const checkoutResult = (await checkoutResponse.json()) as {
				result?: {
					data?: {
						sessionId?: string;
						checkoutUrl?: string;
					};
				};
			};
			console.log('Checkout session created:', checkoutResult);

			// Step 3: Redirect to Stripe checkout
			if (checkoutResult.result?.data?.checkoutUrl) {
				console.log(
					'Redirecting to Stripe checkout:',
					checkoutResult.result.data.checkoutUrl,
				);
				window.location.href = checkoutResult.result.data.checkoutUrl;
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
					<CreditCard className="w-5 h-5" />
					Payment & Billing
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Billing Address Section */}
					<div>
						<h3 className="text-lg font-medium mb-4">Billing Address</h3>

						{/* Address Line 1 */}
						<div className="space-y-2">
							<label htmlFor={line1Id} className="text-sm font-medium">
								Address Line 1 *
							</label>
							<Input
								id={line1Id}
								type="text"
								value={billingAddress.line1}
								onChange={(e) =>
									setBillingAddress({
										...billingAddress,
										line1: e.target.value,
									})
								}
								placeholder="Street address"
								aria-invalid={!!errors.line1}
								aria-describedby={errors.line1 ? `${line1Id}-error` : undefined}
								disabled={isSubmitting}
							/>
							{errors.line1 && (
								<p id={`${line1Id}-error`} className="text-sm text-destructive">
									{errors.line1}
								</p>
							)}
						</div>

						{/* Address Line 2 */}
						<div className="space-y-2">
							<label htmlFor={line2Id} className="text-sm font-medium">
								Address Line 2
							</label>
							<Input
								id={line2Id}
								type="text"
								value={billingAddress.line2}
								onChange={(e) =>
									setBillingAddress({
										...billingAddress,
										line2: e.target.value,
									})
								}
								placeholder="Apartment, suite, etc. (optional)"
								disabled={isSubmitting}
							/>
						</div>

						{/* City and State */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label htmlFor={cityId} className="text-sm font-medium">
									City *
								</label>
								<Input
									id={cityId}
									type="text"
									value={billingAddress.city}
									onChange={(e) =>
										setBillingAddress({
											...billingAddress,
											city: e.target.value,
										})
									}
									placeholder="City"
									aria-invalid={!!errors.city}
									aria-describedby={errors.city ? `${cityId}-error` : undefined}
									disabled={isSubmitting}
								/>
								{errors.city && (
									<p
										id={`${cityId}-error`}
										className="text-sm text-destructive"
									>
										{errors.city}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<label htmlFor={stateId} className="text-sm font-medium">
									State/Province *
								</label>
								<Input
									id={stateId}
									type="text"
									value={billingAddress.state}
									onChange={(e) =>
										setBillingAddress({
											...billingAddress,
											state: e.target.value,
										})
									}
									placeholder="State or Province"
									aria-invalid={!!errors.state}
									aria-describedby={
										errors.state ? `${stateId}-error` : undefined
									}
									disabled={isSubmitting}
								/>
								{errors.state && (
									<p
										id={`${stateId}-error`}
										className="text-sm text-destructive"
									>
										{errors.state}
									</p>
								)}
							</div>
						</div>

						{/* Postal Code and Country */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label htmlFor={postalCodeId} className="text-sm font-medium">
									Postal Code *
								</label>
								<Input
									id={postalCodeId}
									type="text"
									value={billingAddress.postalCode}
									onChange={(e) =>
										setBillingAddress({
											...billingAddress,
											postalCode: e.target.value,
										})
									}
									placeholder="ZIP/Postal Code"
									aria-invalid={!!errors.postalCode}
									aria-describedby={
										errors.postalCode ? `${postalCodeId}-error` : undefined
									}
									disabled={isSubmitting}
								/>
								{errors.postalCode && (
									<p
										id={`${postalCodeId}-error`}
										className="text-sm text-destructive"
									>
										{errors.postalCode}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<label htmlFor={countryId} className="text-sm font-medium">
									Country *
								</label>
								<select
									id={countryId}
									value={billingAddress.country}
									onChange={(e) =>
										setBillingAddress({
											...billingAddress,
											country: e.target.value,
										})
									}
									className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
									aria-invalid={!!errors.country}
									aria-describedby={
										errors.country ? `${countryId}-error` : undefined
									}
									disabled={isSubmitting}
								>
									<option value="US">United States</option>
									<option value="CA">Canada</option>
									<option value="MX">Mexico</option>
									<option value="GB">United Kingdom</option>
									<option value="FR">France</option>
									<option value="DE">Germany</option>
									<option value="AU">Australia</option>
									{/* Add more countries as needed */}
								</select>
								{errors.country && (
									<p
										id={`${countryId}-error`}
										className="text-sm text-destructive"
									>
										{errors.country}
									</p>
								)}
							</div>
						</div>
					</div>

					{/* Payment Info */}
					<div className="border-t pt-4">
						<h3 className="text-lg font-medium mb-2">Payment Information</h3>
						<p className="text-sm text-muted-foreground mb-4">
							You'll be redirected to Stripe for secure payment processing.
						</p>

						{/* Error Display */}
						{booking.error && (
							<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
								<p className="text-sm text-destructive">{booking.error}</p>
							</div>
						)}

						{/* Submit Button */}
						<Button
							type="submit"
							className="w-full"
							disabled={isSubmitting || !isFormValid()}
						>
							{isSubmitting ? (
								<>
									<LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
									Processing...
								</>
							) : (
								<>
									Continue to Payment
									{booking.pricing?.totalAmount && (
										<span className="ml-2">
											${booking.pricing.totalAmount.toFixed(2)}
										</span>
									)}
								</>
							)}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

// Step 5: Confirmation
function ConfirmationStep() {
	const booking = useBookingStore();
	const summary = booking.summary;

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
								<div className="flex justify-between">
									<span className="text-muted-foreground">Room:</span>
									<span className="font-medium capitalize">
										{summary.roomSlug.replace('-', ' ')}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-in:</span>
									<span className="font-medium">
										{new Date(summary.checkInDate).toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</span>
								</div>

								<div className="flex justify-between">
									<span className="text-muted-foreground">Check-out:</span>
									<span className="font-medium">
										{new Date(summary.checkOutDate).toLocaleDateString(
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

								{booking.bookingId && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Booking ID:</span>
										<span className="font-medium font-mono text-sm">
											{booking.bookingId}
										</span>
									</div>
								)}
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
						Check-in: {new Date(summary.checkInDate).toLocaleDateString()}
					</p>
					<p className="text-sm text-muted-foreground">
						Check-out: {new Date(summary.checkOutDate).toLocaleDateString()}
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
									<span>Service & cleaning fees</span>
									<span>${summary.pricing.fees.toFixed(2)}</span>
								</div>
							)}
							{summary.pricing.taxes && summary.pricing.taxes > 0 && (
								<div className="flex justify-between text-muted-foreground">
									<span>Taxes (8%)</span>
									<span>${summary.pricing.taxes.toFixed(2)}</span>
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
