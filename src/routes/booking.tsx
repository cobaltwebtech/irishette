import { Icon } from '@iconify/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useSyncExternalStore,
} from 'react';
import { AuthenticationStep } from '@/components/booking/AuthenticationStep';
import { BookingDetailsStep } from '@/components/booking/BookingDetailsStep';
import { BookingProgressSteps } from '@/components/booking/BookingProgressSteps';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { ConfirmationStep } from '@/components/booking/ConfirmationStep';
import { DatesStep } from '@/components/booking/DatesStep';
import { PaymentStep } from '@/components/booking/PaymentStep';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
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

// Hook to detect if we're on the client side (hydrated)
function useIsClient() {
	return useSyncExternalStore(
		() => () => {}, // subscribe (no-op)
		() => true, // client snapshot
		() => false, // server snapshot
	);
}

function BookingFlow() {
	const { data: session } = useSession();
	const booking = useBookingStore();
	const isClient = useIsClient();
	const navigate = useNavigate();

	// Fetch room data when we have a roomId but no room name
	const { data: roomData } = useQuery(
		trpc.rooms.get.queryOptions(
			{ id: booking.roomId || '' },
			{
				enabled: isClient && !!booking.roomId && !booking.roomName,
				staleTime: 5 * 60 * 1000, // Cache for 5 minutes
			},
		),
	);

	// Use TanStack Query mutation for pricing calculation
	const pricingMutation = useMutation({
		mutationFn: async (input: {
			roomId: string;
			checkInDate: string;
			checkOutDate: string;
			guestCount: number;
		}) => {
			return await trpcClient.bookings.calculateBooking.mutate(input);
		},
		onError: (error) => {
			console.error('Error calculating precise pricing:', error);
		},
	});

	// Event handler for updating pricing in store (non-reactive)
	const onPricingDataFetched = useEffectEvent(
		(pricingData: {
			baseAmount: number;
			feesAmount: number;
			taxAmount: number;
			totalAmount: number;
			numberOfNights: number;
			appliedRules: Array<{
				id: string;
				name: string;
				ruleType: string;
				value: number;
				appliedAmount: number;
			}>;
			taxBreakdown: {
				stateTaxRate: number;
				cityTaxRate: number;
				stateTaxAmount: number;
				cityTaxAmount: number;
				totalTaxAmount: number;
				taxableAmount: number;
			};
		}) => {
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
				appliedRules: pricingData.appliedRules,
				taxBreakdown: pricingData.taxBreakdown,
			});
		},
	);

	// Event handler for navigation after authentication (non-reactive)
	const onAuthenticated = useEffectEvent(() => {
		booking.actions.setStep('details');
	});

	// Update room name when data is fetched (derived state sync)
	useEffect(() => {
		if (roomData && booking.roomSlug && booking.roomId) {
			booking.actions.setRoom(booking.roomId, booking.roomSlug, roomData.name);
		}
	}, [roomData, booking.roomSlug, booking.roomId, booking.actions]);

	// Calculate pricing when booking data changes
	const calculatePricing = useCallback(() => {
		if (
			!isClient ||
			!booking.roomId ||
			!booking.checkInDate ||
			!booking.checkOutDate
		) {
			return;
		}

		console.log('Calculating precise pricing for booking summary...');

		pricingMutation.mutate(
			{
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: booking.guestCount || 1,
			},
			{
				onSuccess: (pricingData) => {
					onPricingDataFetched(pricingData);
				},
			},
		);
	}, [
		isClient,
		booking.roomId,
		booking.checkInDate,
		booking.checkOutDate,
		booking.guestCount,
		pricingMutation.mutate,
		// onPricingDataFetched is a useEffectEvent and doesn't need to be a dependency
	]);

	useEffect(() => {
		calculatePricing();
	}, [calculatePricing]);

	// Handle URL parameters for step navigation
	useEffect(() => {
		if (!isClient) return;

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
	}, [isClient, booking.actions]);

	// Handle authentication callback - advance to details step when authenticated
	useEffect(() => {
		if (session?.user && booking.currentStep === 'auth') {
			onAuthenticated();
		}
	}, [session?.user, booking.currentStep]);

	// Wait for hydration before rendering
	if (!isClient) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	// Show button if no active booking
	if (!booking.hasActiveBooking()) {
		const handleNavigateToRooms = () => {
			navigate({ to: '/' }).then(() => {
				// Wait a brief moment for the page to render
				setTimeout(() => {
					const roomsSection = document.querySelector('[data-rooms-section]');
					if (roomsSection) {
						roomsSection.scrollIntoView({ behavior: 'smooth' });
					}
				}, 100);
			});
		};

		return (
			<div className="max-w-5xl mx-auto flex flex-auto flex-col justify-center">
				<Card>
					<CardHeader>
						<CardTitle className="text-center text-2xl font-bold">
							No Active Booking
						</CardTitle>
					</CardHeader>
					<CardContent className="text-center space-y-4">
						<p className="text-muted-foreground">
							You have no active booking started yet.
						</p>
						<p className="text-muted-foreground">
							You can start a new booking by viewing our available rooms.
						</p>
						<Button onClick={handleNavigateToRooms}>
							<Icon icon="tabler:home-search" />
							Book a Stay
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="bg-background">
			<BookingProgressSteps />

			{/* Main Content */}
			<div className="container mx-auto max-w-4xl px-4 py-12">
				{/* Render all steps except confirmation */}
				{!booking.isStep('confirmation') && (
					<div className="grid lg:grid-cols-3 gap-8">
						{/* Booking Steps */}
						<div className="lg:col-span-2 order-2 lg:order-1">
							{booking.isStep('dates') && <DatesStep />}
							{booking.isStep('auth') && <AuthenticationStep />}
							{booking.isStep('details') && <BookingDetailsStep />}
							{booking.isStep('payment') && <PaymentStep />}
							{booking.isStep('confirmation') && <ConfirmationStep />}
						</div>

						{/* Booking Summary Sidebar */}
						<div className="lg:col-span-1 order-1 lg:order-2">
							<BookingSummary />
						</div>
					</div>
				)}

				{/* Render confirmation step without sidebar and use full width container */}
				{booking.isStep('confirmation') && <ConfirmationStep />}
			</div>
		</div>
	);
}
