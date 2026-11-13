import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { z } from 'zod';

import { AuthenticationStep } from '@/components/booking/AuthenticationStep';
import { BookingDetailsStep } from '@/components/booking/BookingDetailsStep';
import { BookingProgressSteps } from '@/components/booking/BookingProgressSteps';
import { BookingSummaryCard } from '@/components/booking/BookingSummaryCard';
import { PaymentStep } from '@/components/booking/PaymentStep';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { useSession } from '@/lib/auth/session';
import { bookingSteps, useBookingStore } from '@/stores';
import { isPricingComplete } from '@/utils/booking-utils';
import { canonicalLink, seo } from '@/utils/seo';

type BookingPricing = RouterOutputs['bookings']['calculateBooking'];

export const Route = createFileRoute('/booking/')({
	head: () => ({
		meta: seo({
			title: 'Book Your Stay | Irishette.com',
			path: '/booking',
		}),
		links: [canonicalLink('/booking')],
	}),
	// Unknown steps are dropped; a valid one is clamped to the furthest step
	// the draft allows (below).
	validateSearch: z.object({
		step: z.enum(bookingSteps).optional().catch(undefined),
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
	const session = useSession();
	const trpc = useTRPC();
	const booking = useBookingStore();
	const isClient = useIsClient();
	const navigate = useNavigate();
	const { step: stepFromUrl } = Route.useSearch();

	// Fetch room data when we have a roomId but no room name
	const { data: roomData } = useQuery(
		trpc.rooms.get.queryOptions(
			{ id: booking.roomId || '' },
			{
				enabled:
					isClient &&
					!!booking.roomId &&
					(!booking.roomName || booking.maxGuests === null),
				staleTime: 5 * 60 * 1000, // Cache for 5 minutes
			},
		),
	);

	// Precise pricing for the booking summary (recalculated when inputs change)
	const { data: pricingData } = useQuery(
		trpc.bookings.calculateBooking.queryOptions(
			{
				roomId: booking.roomId ?? '',
				checkInDate: booking.checkInDate ?? '',
				checkOutDate: booking.checkOutDate ?? '',
				guestCount: booking.guestCount || 1,
			},
			{
				enabled:
					isClient &&
					!!booking.roomId &&
					!!booking.checkInDate &&
					!!booking.checkOutDate,
				staleTime: 1000, // 1 second - recalculate if data changes
			},
		),
	);

	// Event handler for updating pricing in store (non-reactive)
	const onPricingDataFetched = useEffectEvent((pricingData: BookingPricing) => {
		// Validate that we have the expected data structure
		if (!isPricingComplete(pricingData)) {
			console.error('Incomplete pricing data');
			return;
		}

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
	});

	// Event handler for navigation after authentication (non-reactive)
	const onAuthenticated = useEffectEvent(() => {
		booking.actions.setStep('details');
	});

	// Update room name when data is fetched (derived state sync)
	useEffect(() => {
		if (roomData && booking.roomSlug && booking.roomId) {
			booking.actions.setRoom(
				booking.roomId,
				booking.roomSlug,
				roomData.name,
				roomData.maxGuests,
			);
		}
	}, [roomData, booking.roomSlug, booking.roomId, booking.actions]);

	// Sync pricing data to store when fetched
	useEffect(() => {
		if (pricingData) {
			onPricingDataFetched(pricingData);
		}
	}, [pricingData]);

	// ?step= jumps at most to the furthest step the draft allows.
	const signedIn = !!session?.user;
	useEffect(() => {
		if (!isClient || !stepFromUrl) return;
		const furthest = booking.actions.furthestAllowedStep(signedIn);
		const allowed =
			bookingSteps.indexOf(stepFromUrl) <= bookingSteps.indexOf(furthest)
				? stepFromUrl
				: furthest;
		booking.actions.setStep(allowed);
	}, [isClient, stepFromUrl, signedIn, booking.actions]);

	// Handle authentication callback - advance to details step when authenticated
	useEffect(() => {
		if (session?.user && booking.currentStep === 'auth') {
			onAuthenticated();
		}
	}, [session?.user, booking.currentStep]);

	// Wait for hydration before rendering
	if (!isClient) {
		return (
			<div className="flex items-center justify-center bg-background">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	// Show button if no active booking
	if (!booking.hasActiveBooking()) {
		const handleNavigateToRooms = () => {
			void navigate({ to: '/' }).then(() => {
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
			<div className="mx-auto flex max-w-5xl flex-auto flex-col justify-center">
				<Card>
					<CardHeader>
						<CardTitle className="text-center text-2xl font-bold">
							No Active Booking
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4 text-center">
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
				<div className="grid gap-8 lg:grid-cols-3">
					{/* Booking Steps */}
					<div className="order-2 lg:order-1 lg:col-span-2">
						{booking.isStep('auth') && <AuthenticationStep />}
						{booking.isStep('details') && <BookingDetailsStep />}
						{booking.isStep('payment') && <PaymentStep />}
					</div>

					{/* Booking Summary Sidebar */}
					<div className="order-1 lg:order-2 lg:col-span-1">
						<BookingSummaryCard />
					</div>
				</div>
			</div>
		</div>
	);
}
