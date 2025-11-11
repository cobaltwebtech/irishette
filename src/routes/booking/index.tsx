import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { AuthenticationStep } from '@/components/booking/AuthenticationStep';
import { BookingDetailsStep } from '@/components/booking/BookingDetailsStep';
import { BookingProgressSteps } from '@/components/booking/BookingProgressSteps';
import { BookingSummaryCard } from '@/components/booking/BookingSummaryCard';
import { PaymentStep } from '@/components/booking/PaymentStep';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';
import { type BookingStep, useBookingStore } from '@/stores';

export const Route = createFileRoute('/booking/')({
	head: () => ({
		meta: [
			{
				title: 'Book Your Stay | Irishette.com',
			},
		],
	}),
	validateSearch: (search: Record<string, unknown>) => {
		return {
			step: search.step as BookingStep | undefined,
		};
	},
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
	const { step: stepFromUrl } = Route.useSearch();

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

	// Use TanStack Query to fetch pricing (instead of mutation + useEffect)
	const { data: pricingData } = useQuery({
		queryKey: [
			'booking-pricing',
			booking.roomId,
			booking.checkInDate,
			booking.checkOutDate,
			booking.guestCount,
		],
		queryFn: async () => {
			if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
				return null;
			}

			console.log('Calculating precise pricing for booking summary...');

			return await trpcClient.bookings.calculateBooking.mutate({
				roomId: booking.roomId,
				checkInDate: booking.checkInDate,
				checkOutDate: booking.checkOutDate,
				guestCount: booking.guestCount || 1,
			});
		},
		enabled:
			isClient &&
			!!booking.roomId &&
			!!booking.checkInDate &&
			!!booking.checkOutDate,
		staleTime: 1000, // 1 second - recalculate if data changes
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

	// Sync pricing data to store when fetched
	useEffect(() => {
		if (pricingData) {
			onPricingDataFetched(pricingData);
		}
	}, [pricingData]);

	// Handle URL search params for step navigation
	useEffect(() => {
		if (!isClient || !stepFromUrl) return;

		const validSteps: BookingStep[] = [
			'dates',
			'auth',
			'details',
			'payment',
			'confirmation',
		];

		if (validSteps.includes(stepFromUrl)) {
			booking.actions.setStep(stepFromUrl);
		}
	}, [isClient, stepFromUrl, booking.actions]);

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
				<div className="grid lg:grid-cols-3 gap-8">
					{/* Booking Steps */}
					<div className="lg:col-span-2 order-2 lg:order-1">
						{booking.isStep('auth') && <AuthenticationStep />}
						{booking.isStep('details') && <BookingDetailsStep />}
						{booking.isStep('payment') && <PaymentStep />}
					</div>

					{/* Booking Summary Sidebar */}
					<div className="lg:col-span-1 order-1 lg:order-2">
						<BookingSummaryCard />
					</div>
				</div>
			</div>
		</div>
	);
}
