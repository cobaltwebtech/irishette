import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
	ArrowLeft,
	Bath,
	Calendar as CalendarIcon,
	Car,
	Coffee,
	Tv,
	Wifi,
	Wind,
	Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { BookingDebugPanel } from '@/components/BookingDebugPanel';
import RoomAvailabilityCalendar from '@/components/RoomAvailabilityCalendar';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useBookingStore } from '@/stores';

export const Route = createFileRoute('/rose-room')({
	head: () => ({
		meta: [
			{
				title: 'Rose Room | Irishette.com',
			},
		],
	}),
	component: RoseRoomPage,
});

function RoseRoomPage() {
	const [selectedDateRange, setSelectedDateRange] = useState<
		DateRange | undefined
	>(undefined);
	const [totalPrice, setTotalPrice] = useState<number>(0);
	const [nights, setNights] = useState<number>(0);
	const booking = useBookingStore();
	const navigate = useNavigate();

	// Room information
	const roomSlug = 'rose-room';

	// Initialize booking store if we're starting a new booking
	useEffect(() => {
		// Check if we have a room already set in the store
		if (!booking.roomSlug || booking.roomSlug !== roomSlug) {
			// This will reset any existing booking and start fresh for this room
			booking.actions.initializeBooking('biolbnhax7ZK9ctPpb2rq', roomSlug); // Actual Rose Room ID from database
		}
	}, [booking.roomSlug, booking.actions]);

	const handleDateRangeSelect = (
		dateRange: DateRange | undefined,
		totalPriceValue?: number,
		nightsValue?: number,
	) => {
		setSelectedDateRange(dateRange);
		setTotalPrice(totalPriceValue || 0);
		setNights(nightsValue || 0);

		// Update booking store with selected dates
		if (dateRange?.from && dateRange?.to) {
			// Convert dates to ISO strings for storage
			const checkInDate = dateRange.from.toISOString().split('T')[0];
			const checkOutDate = dateRange.to.toISOString().split('T')[0];

			booking.actions.setDates(checkInDate, checkOutDate);

			// Set pricing information if available
			if (totalPriceValue && nightsValue) {
				// Calculate fees (same logic as PaymentService)
				const cleaningFee = 50;
				const serviceFee = Math.round(totalPriceValue * 0.12); // 12% service fee
				const totalFees = cleaningFee + serviceFee;

				// Calculate tax on subtotal (base + fees)
				const subtotal = totalPriceValue + totalFees;
				const taxAmount = Math.round(subtotal * 0.08); // 8% tax on subtotal
				const totalAmount = subtotal + taxAmount;

				booking.actions.setPricing({
					basePrice: totalPriceValue / nightsValue, // Calculate base price per night
					nights: nightsValue,
					subtotal: totalPriceValue,
					taxes: taxAmount,
					fees: totalFees,
					totalAmount: totalAmount,
					currency: 'USD',
				});
			}
		} else {
			// Clear dates if no range selected
			booking.actions.setDates('', '');
		}
	};

	const handleBookNow = () => {
		// Validate that we have the required information
		if (!selectedDateRange?.from || !selectedDateRange?.to) {
			// Could show an error toast here
			return;
		}

		// Check if booking store validation passes
		if (!booking.canProceed()) {
			// Could show validation errors
			const errors = booking.getValidationErrors();
			console.warn('Booking validation failed:', errors);
			return;
		}

		// Proceed to next step (authentication)
		booking.actions.setStep('auth');

		// Navigate to booking flow route
		navigate({ to: '/booking' });
		console.log('Starting booking process with data:', booking.summary);
	};

	return (
		<div className="min-h-screen bg-background">
			<BookingDebugPanel />
			{/* Back Navigation */}
			<div className="container mx-auto max-w-6xl px-4 py-4">
				<Link
					to="/"
					className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="w-4 h-4 mr-2" />
					Back to Home
				</Link>
			</div>

			{/* Hero Section */}
			<section className="relative bg-gradient-to-b from-rose-50 to-background py-16 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
						Rose Room
					</h1>
					<p className="text-xl md:text-2xl text-muted-foreground mb-8 font-medium">
						Leave your worries behind in this spacious and tranquil retreat.
					</p>
				</div>
			</section>

			{/* Availability Calendar */}
			<section className="py-16 px-4" data-calendar-section>
				<div className="container mx-auto max-w-4xl">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-2">
							<CalendarIcon className="w-8 h-8 text-rose-600" />
							Check Availability
						</h2>
						<p className="text-muted-foreground text-lg">
							Select your preferred dates to see availability and pricing
						</p>
					</div>

					<div className="grid lg:grid-cols-2 gap-8 items-start">
						{/* Calendar */}
						<div className="flex justify-center">
							<RoomAvailabilityCalendar
								roomSlug="rose-room"
								selectedDateRange={selectedDateRange}
								onDateRangeSelect={handleDateRangeSelect}
								className="w-full"
								minNights={1}
								maxNights={30}
							/>
						</div>

						{/* Booking Information */}
						<div className="space-y-6">
							<Card className="border-rose-200">
								<CardHeader>
									<CardTitle className="text-rose-800">
										Booking Information
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{selectedDateRange?.from && selectedDateRange?.to ? (
										<div>
											<p className="text-sm text-muted-foreground mb-2">
												Selected Dates:
											</p>
											<div className="space-y-2">
												<p className="font-semibold">
													Check-in:{' '}
													{selectedDateRange.from.toLocaleDateString('en-US', {
														weekday: 'long',
														year: 'numeric',
														month: 'long',
														day: 'numeric',
													})}
												</p>
												<p className="font-semibold">
													Check-out:{' '}
													{selectedDateRange.to.toLocaleDateString('en-US', {
														weekday: 'long',
														year: 'numeric',
														month: 'long',
														day: 'numeric',
													})}
												</p>
											</div>
											<div className="mt-4 p-4 bg-rose-50 rounded-lg space-y-2">
												<div className="flex justify-between items-center">
													<span className="text-rose-800 font-semibold">
														{nights} night{nights !== 1 ? 's' : ''}
													</span>
													<span className="text-rose-800 font-semibold">
														${totalPrice.toFixed(2)}
													</span>
												</div>
												<p className="text-sm text-muted-foreground">
													Average: $
													{nights > 0 ? (totalPrice / nights).toFixed(2) : '0'}
													/night
												</p>
												<p className="text-xs text-muted-foreground">
													*Rates include all fees and taxes
												</p>
											</div>
										</div>
									) : (
										<div className="text-center py-8">
											<CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
											<p className="text-muted-foreground">
												Select a date to see pricing and availability
											</p>
										</div>
									)}
								</CardContent>
							</Card>

							{selectedDateRange?.from && selectedDateRange?.to && (
								<Card className="border-rose-200 bg-rose-50">
									<CardContent className="p-6">
										<h4 className="font-semibold text-rose-800 mb-2">
											Ready to book your stay?
										</h4>
										<p className="text-sm text-muted-foreground mb-4">
											Continue with your reservation for {nights} night
											{nights !== 1 ? 's' : ''} at the Rose Room
										</p>
										<Button
											className="w-full bg-rose-600 hover:bg-rose-700"
											onClick={handleBookNow}
										>
											Book Now - ${totalPrice.toFixed(2)} for {nights} night
											{nights !== 1 ? 's' : ''}
										</Button>
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* Room Description */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-rose-200">
						<CardHeader>
							<CardTitle className="text-2xl text-rose-800">
								Your Private Retreat
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="prose prose-lg max-w-none">
								<p className="text-foreground/90 leading-relaxed mb-6">
									Your suite offers a private entrance for complete seclusion.
									Step across your own deck to the main door, which opens into a
									bright enclosed sun porch. To the left, you'll find a
									convenient kitchenette with a coffee maker, refrigerator,
									microwave and an ironing board — plus ample space for your
									luggage and clothing.
								</p>
								<p className="text-foreground/90 leading-relaxed">
									Straight ahead, the Rose Room awaits, featuring a cozy
									queen-sized bed in a light-filled space with a large picture
									window. Enjoy modern comforts including a TV with Prime Video
									and Netflix, a ceiling fan, and electric fireplace. The suite
									also includes a walk-in shower, a separate work space, and
									everything you need for a comfortable, private stay.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			{/* Amenities */}
			<section className="py-16 px-4 bg-muted/20">
				<div className="container mx-auto max-w-6xl">
					<h2 className="text-3xl font-bold text-center mb-12">
						Room Amenities
					</h2>

					<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
						<Card className="text-center p-6">
							<Coffee className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Kitchenette</h3>
							<p className="text-sm text-muted-foreground">
								Coffee maker, refrigerator, microwave
							</p>
						</Card>

						<Card className="text-center p-6">
							<Bath className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Walk-in Shower</h3>
							<p className="text-sm text-muted-foreground">
								Private en-suite bathroom
							</p>
						</Card>

						<Card className="text-center p-6">
							<Tv className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Entertainment</h3>
							<p className="text-sm text-muted-foreground">
								TV with Prime Video & Netflix
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wind className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Climate Control</h3>
							<p className="text-sm text-muted-foreground">
								Ceiling fan & electric fireplace
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wifi className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Work Space</h3>
							<p className="text-sm text-muted-foreground">
								Dedicated area with WiFi
							</p>
						</Card>

						<Card className="text-center p-6">
							<Car className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Private Entrance</h3>
							<p className="text-sm text-muted-foreground">
								Independent access via deck
							</p>
						</Card>

						<Card className="text-center p-6">
							<div className="w-8 h-8 bg-rose-600 rounded mx-auto mb-4 flex items-center justify-center">
								<span className="text-white text-sm font-bold">Q</span>
							</div>
							<h3 className="font-semibold mb-2">Queen Bed</h3>
							<p className="text-sm text-muted-foreground">
								Comfortable sleeping for two
							</p>
						</Card>

						<Card className="text-center p-6">
							<Zap className="w-8 h-8 text-rose-600 mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Modern Comforts</h3>
							<p className="text-sm text-muted-foreground">
								All essential amenities included
							</p>
						</Card>
					</div>
				</div>
			</section>

			{/* Booking CTA */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<Card className="bg-rose-50 border-rose-200">
						<CardHeader>
							<CardTitle className="text-2xl text-rose-800">
								Ready to Book?
							</CardTitle>
							<CardDescription className="text-base">
								Experience the tranquil charm of the Rose Room
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground mb-6">
								Book your stay directly with us for the best rates and
								personalized service.
							</p>
							<div className="flex flex-col sm:flex-row gap-4 justify-center">
								<Button
									className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-md font-medium transition-colors"
									onClick={() => {
										// Scroll to the availability calendar section
										const calendarSection = document.querySelector(
											'[data-calendar-section]',
										);
										if (calendarSection) {
											calendarSection.scrollIntoView({ behavior: 'smooth' });
										}
									}}
								>
									Check Availability
								</Button>
								<Link
									to="/"
									className="border border-rose-600 text-rose-600 hover:bg-rose-50 px-8 py-3 rounded-md font-medium transition-colors inline-flex items-center justify-center"
								>
									View All Rooms
								</Link>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
