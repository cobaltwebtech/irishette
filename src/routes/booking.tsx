import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AuthenticationStep } from '@/components/booking/AuthenticationStep';
import { BookingDetailsStep } from '@/components/booking/BookingDetailsStep';
import { BookingHeader } from '@/components/booking/BookingHeader';
import { BookingProgressSteps } from '@/components/booking/BookingProgressSteps';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { ConfirmationStep } from '@/components/booking/ConfirmationStep';
import { DatesStep } from '@/components/booking/DatesStep';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';
import { type BookingStep, useBookingStore } from '@/stores';

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

	// Handle hydration and scroll to top on mount
	useEffect(() => {
		setIsHydrated(true);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	// Fetch room name if not available in booking store
	useEffect(() => {
		const fetchRoomName = async () => {
			if (isHydrated && booking.roomId && !booking.roomName) {
				try {
					const room = await trpcClient.rooms.get.query({ id: booking.roomId });
					// Update the booking store with the room name
					if (booking.roomSlug) {
						booking.actions.setRoom(
							booking.roomId,
							booking.roomSlug,
							room.name,
						);
					}
				} catch (error) {
					console.error('Failed to fetch room name:', error);
				}
			}
		};

		fetchRoomName();
	}, [
		isHydrated,
		booking.roomId,
		booking.roomName,
		booking.roomSlug,
		booking.actions,
	]);

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
			<BookingHeader />
			<BookingProgressSteps />

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
