import { Icon } from '@iconify/react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { authClient, useSession } from '@/lib/auth-client';
import { useBookingStore } from '@/stores';
import { bookingActions, bookingStore } from '@/stores/booking-store';
import { parseISODateString } from '@/utils/booking-utils';

export function BookingDetailsStep() {
	const booking = useBookingStore();
	const { data: session } = useSession();
	const nameId = useId();
	const emailId = useId();
	const phoneId = useId();
	const guestsId = useId();
	const requestsId = useId();

	// Form state - use lazy initialization to avoid unnecessary useEffect
	const [guestName, setGuestName] = useState(
		() => session?.user?.name || booking.guestInfo?.name || '',
	);
	const [guestEmail, setGuestEmail] = useState(
		() => session?.user?.email || booking.guestInfo?.email || '',
	);
	const [guestPhone, setGuestPhone] = useState(() => {
		// Prioritize session phone, then booking phone
		const sessionPhone = (session?.user as { phoneNumber?: string })
			?.phoneNumber;
		return sessionPhone || booking.guestInfo?.phone || '';
	});
	const [numberOfGuests, setNumberOfGuests] = useState(booking.guestCount || 1);
	const [specialRequests, setSpecialRequests] = useState(
		() => booking.guestInfo?.specialRequests || '',
	);

	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Validate essential booking data on mount only
	// biome-ignore lint/correctness/useExhaustiveDependencies: This effect should only run once on mount to validate initial booking data
	useEffect(() => {
		// Check if essential booking data is present on mount
		if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
			console.error(
				'Missing essential booking data on BookingDetailsStep mount:',
				{
					roomId: booking.roomId,
					checkInDate: booking.checkInDate,
					checkOutDate: booking.checkOutDate,
				},
			);
			booking.actions.setError(
				'Missing booking information. Please start from the beginning.',
			);
		}
	}, []);

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
				await authClient.updateUser({
					name: guestName.trim(),
				});
				console.log('User name updated in Better Auth:', guestName.trim());
			} catch (error) {
				console.warn('Failed to update user name in Better Auth:', error);
				// Don't block the booking flow if user update fails
			}
		}

		// Update user's phone number via tRPC if it's different and user is logged in
		if (
			session?.user &&
			guestPhone.trim() &&
			guestPhone.trim() !==
				(session.user as { phoneNumber?: string })?.phoneNumber
		) {
			try {
				await trpcClient.users.updatePhoneNumber.mutate({
					phoneNumber: guestPhone.trim(),
				});
				console.log('User phone number updated via tRPC:', guestPhone.trim());
			} catch (error) {
				console.warn('Failed to update user phone number via tRPC:', error);
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

		setIsSubmitting(true);
		booking.actions.clearError();

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
				booking.actions.setError(
					'Failed to calculate pricing. Please try again.',
				);
				setIsSubmitting(false);
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

			// If we have no pricing at all, show an error and stop
			if (!booking.pricing || !booking.pricing.totalAmount) {
				console.error('No valid pricing data available');
				booking.actions.setError(
					'Failed to calculate pricing. Please try again or refresh the page.',
				);
				setIsSubmitting(false);
				return;
			}
			// If we have existing pricing, warn but allow to continue
			console.warn('Using existing pricing data due to calculation error');
		}

		// Final validation before proceeding to payment
		// Use canProceedToPayment() which reads directly from bookingStore.state
		// instead of the reactive booking object to avoid stale state issues
		if (!bookingActions.canProceedToPayment()) {
			const currentState = bookingStore.state;
			console.error('Invalid booking state before payment:', {
				hasGuestInfo: !!currentState.guestInfo,
				hasPricing: !!currentState.pricing,
				totalAmount: currentState.pricing?.totalAmount,
				guestInfoDetails: currentState.guestInfo,
			});
			booking.actions.setError(
				'Booking information is incomplete. Please try again.',
			);
			setIsSubmitting(false);
			return;
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

		// Read from direct store state to ensure we have the latest values
		const currentState = bookingStore.state;

		if (!currentState.guestInfo || !currentState.pricing) {
			console.error('Missing booking information in initiatePayment:', {
				hasGuestInfo: !!currentState.guestInfo,
				hasPricing: !!currentState.pricing,
			});
			booking.actions.setError(
				'Missing booking information. Please refresh and try again.',
			);
			setIsSubmitting(false);
			return;
		}

		if (
			!currentState.roomId ||
			!currentState.checkInDate ||
			!currentState.checkOutDate
		) {
			booking.actions.setError('Missing booking dates or room information');
			setIsSubmitting(false);
			return;
		}

		if (currentState.pricing.totalAmount <= 0) {
			console.error('Invalid total amount:', currentState.pricing.totalAmount);
			booking.actions.setError(
				'Invalid booking total. Please refresh and try again.',
			);
			setIsSubmitting(false);
			return;
		}

		try {
			// Prepare booking data for creation using direct store state
			const bookingData = {
				roomId: currentState.roomId,
				checkInDate: currentState.checkInDate,
				checkOutDate: currentState.checkOutDate,
				guestCount: currentState.guestCount,
				guestName: currentState.guestInfo.name,
				guestEmail: currentState.guestInfo.email,
				guestPhone: currentState.guestInfo.phone,
				specialRequests: currentState.guestInfo.specialRequests || '',
				basePrice: currentState.pricing.basePrice,
				serviceFee: currentState.pricing.fees || 0,
				taxAmount: currentState.pricing.taxes || 0,
				totalAmount: currentState.pricing.totalAmount,
			};

			// Create booking via tRPC
			console.log('Creating booking...', bookingData);
			const createBookingResult =
				await trpcClient.bookings.createBooking.mutate(bookingData);
			console.log('Booking created:', createBookingResult);

			if (!createBookingResult?.bookingId) {
				throw new Error('No booking ID returned from server');
			}

			const bookingId = createBookingResult.bookingId;
			booking.actions.setBookingId(bookingId);

			// Move to payment step for in-app checkout
			booking.actions.setStep('payment');
		} catch (error) {
			console.error('Payment processing error:', error);
			booking.actions.setError(
				error instanceof Error
					? error.message
					: 'An error occurred while processing your booking',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:user-circle" className="size-6" />
					Booking Details Step
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Guest Information */}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Guest Information</h3>

					<div className="grid sm:grid-cols-2 gap-4">
						{/* Guest Name */}
						<div className="space-y-2">
							<Label htmlFor={nameId}>Full Name *</Label>
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
							<Label htmlFor={emailId}>Email Address *</Label>
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
							<Label htmlFor={phoneId}>Phone Number *</Label>
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
							<Label htmlFor={guestsId}>Number of Guests *</Label>
							<Input
								id={guestsId}
								type="number"
								min="1"
								max="4"
								value={numberOfGuests}
								onChange={(e) =>
									setNumberOfGuests(parseInt(e.target.value, 10) || 1)
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
					<Label htmlFor={requestsId}>Special Requests</Label>
					<Textarea
						id={requestsId}
						placeholder="Any special requests or notes for your stay? (optional)"
						value={specialRequests}
						onChange={(e) => setSpecialRequests(e.target.value)}
						rows={3}
						maxLength={1000}
					/>
					<p
						className={`text-xs ${
							specialRequests.length > 900
								? 'text-destructive font-semibold'
								: 'text-muted-foreground'
						}`}
					>
						{specialRequests.length} / 1000 characters
					</p>
					<p className="text-xs text-muted-foreground">
						Examples: dietary restrictions, accessibility needs, early
						check-in/late check-out requests, etc. <strong>Note:</strong> While
						we cannot guarantee all requests will be accommodated, we will make
						a best effort to honor them.
					</p>
				</div>

				{/* Summary */}
				<Card className="bg-muted">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Icon icon="tabler:checklist" className="size-6" />
							Booking Summary
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm space-y-1 font-semibold">
							<p>
								<span className="font-light">Room:</span>{' '}
								{booking.roomName || booking.roomSlug || 'N/A'}
							</p>
							<p>
								<span className="font-light">Check-in:</span>{' '}
								{booking.checkInDate
									? parseISODateString(booking.checkInDate).toLocaleDateString(
											'en-US',
											{
												weekday: 'short',
												month: 'short',
												day: 'numeric',
												year: 'numeric',
											},
										)
									: 'N/A'}
							</p>
							<p>
								<span className="font-light">Check-out:</span>{' '}
								{booking.checkOutDate
									? parseISODateString(booking.checkOutDate).toLocaleDateString(
											'en-US',
											{
												weekday: 'short',
												month: 'short',
												day: 'numeric',
												year: 'numeric',
											},
										)
									: 'N/A'}
							</p>
							<p>
								<span className="font-light">Guests:</span> {numberOfGuests}
							</p>
							<p>
								<span className="font-light">Total Due (USD):</span> $
								{booking.pricing?.totalAmount?.toFixed(2) || '0.00'}
							</p>
						</div>
					</CardContent>
				</Card>

				{/* Error Display */}
				{booking.error && (
					<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
						<p className="text-sm text-destructive">{booking.error}</p>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex gap-3">
					<Button
						variant="outline"
						onClick={() => {
							// Navigate back to the room page
							window.location.href =
								booking.roomSlug === 'rose-room'
									? '/rooms/rose-room'
									: '/rooms/texas-room';
						}}
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
								<Icon icon="tabler:loader-2" className="size-3 animate-spin" />
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
