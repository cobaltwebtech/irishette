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
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import RoomAvailabilityCalendar from '@/components/RoomAvailabilityCalendar';
import { RoomGallery } from '@/components/RoomGallery';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useBookingStore } from '@/stores';

export const Route = createFileRoute('/rooms/texas-room')({
	head: () => ({
		meta: [
			{
				title: 'Texas Room | Irishette.com',
			},
		],
	}),
	component: TexasRoomPage,
});

function TexasRoomPage() {
	const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(
		undefined,
	);
	const [totalPrice, setTotalPrice] = useState<number>(0);
	const [nights, setNights] = useState<number>(0);
	const booking = useBookingStore();
	const navigate = useNavigate();

	// Room information
	const roomSlug = 'texas-room';

	// Texas Room images from Cloudinary
	const texasRoomImages = [
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/2438d940-5419-4f77-985c-081d766b2a77.jpg',
			alt: 'Texas Room - Image 1',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/67b358eb-1af2-4dae-9114-b74636c32119.jpg',
			alt: 'Texas Room - Image 2',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/9abc8cd6-f843-4e67-9142-eb473adff4f5.jpg',
			alt: 'Texas Room - Image 3',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac.jpg',
			alt: 'Texas Room - Image 4',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/b2191747-41d4-4960-91fc-eaeefabddc3a.jpg',
			alt: 'Texas Room - Image 5',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/b495460e-218d-4e2b-8b5b-3e87df2a4b43.jpg',
			alt: 'Texas Room - Image 6',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/b665f34a-dd96-41ad-ad07-672cebefd93e.jpg',
			alt: 'Texas Room - Image 7',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/dfb868ed-b654-4cd7-83c9-7f1a63b1c35a.jpg',
			alt: 'Texas Room - Image 8',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/ef65e11c-d2d0-4d28-bc7f-ae0ea1e5c68c.jpg',
			alt: 'Texas Room - Image 9',
		},
	];

	// Initialize booking store if we're starting a new booking
	useEffect(() => {
		// Check if we have a room already set in the store
		if (!booking.roomSlug || booking.roomSlug !== roomSlug) {
			// This will reset any existing booking and start fresh for this room
			booking.actions.initializeBooking('qSDFP06DGD7v8M3rC3DwE', roomSlug); // Actual Texas Room ID from database
		}
	}, [booking.roomSlug, booking.actions]);

	const handleRangeSelect = (
		dateRange: DateRange | undefined,
		totalPriceValue?: number,
		nightsValue?: number,
	) => {
		setSelectedRange(dateRange);
		setTotalPrice(totalPriceValue || 0);
		setNights(nightsValue || 0);

		// Update booking store with selected dates
		if (dateRange?.from && dateRange?.to) {
			// Convert dates to ISO strings for storage without timezone shift
			const checkInDate = `${dateRange.from.getFullYear()}-${String(dateRange.from.getMonth() + 1).padStart(2, '0')}-${String(dateRange.from.getDate()).padStart(2, '0')}`;
			const checkOutDate = `${dateRange.to.getFullYear()}-${String(dateRange.to.getMonth() + 1).padStart(2, '0')}-${String(dateRange.to.getDate()).padStart(2, '0')}`;

			booking.actions.setDates(checkInDate, checkOutDate);

			// Store only the base pricing information for display
			// Fees and taxes will be calculated in the booking flow
			if (totalPriceValue && nightsValue) {
				const basePrice = totalPriceValue / nightsValue;

				booking.actions.setPricing({
					basePrice: basePrice,
					nights: nightsValue,
					subtotal: totalPriceValue, // This is just the base room cost
					taxes: 0, // No taxes shown on room selection
					fees: 0, // No fees shown on room selection
					totalAmount: totalPriceValue, // Base room cost only
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
		if (!selectedRange?.from || !selectedRange?.to) {
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
			<section className="relative bg-gradient-to-b from-accent/20 to-background py-16 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
						Texas Room
					</h1>
					<p className="text-xl md:text-2xl text-muted-foreground mb-8 font-medium">
						Experience true Texas charm in this spacious and inviting retreat.
					</p>
				</div>
			</section>

			{/* Photo Gallery */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<h2 className="text-3xl font-bold text-center mb-12">
						Texas Room Gallery
					</h2>
					<RoomGallery
						images={texasRoomImages}
						roomName="Texas Room"
						className="max-w-4xl mx-auto"
						mainImageHeight={500}
						thumbImageHeight={100}
						thumbsPerView={5}
					/>
				</div>
			</section>

			{/* Availability Calendar */}
			<section className="py-16 px-4" data-calendar-section>
				<div className="container mx-auto max-w-4xl">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-2">
							<CalendarIcon className="w-8 h-8 text-accent" />
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
								roomSlug="texas-room"
								selectedDateRange={selectedRange}
								onDateRangeSelect={handleRangeSelect}
								className="w-full max-w-2xl"
								minNights={1}
								maxNights={30}
							/>
						</div>

						{/* Booking Information */}
						<div className="space-y-6">
							<Card className="border-accent/20">
								<CardHeader>
									<CardTitle className="text-accent-foreground">
										Booking Information
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{selectedRange?.from && selectedRange?.to ? (
										<div>
											<p className="text-sm text-muted-foreground mb-2">
												Selected Dates:
											</p>
											<p className="font-semibold text-lg">
												{selectedRange.from.toLocaleDateString('en-US', {
													weekday: 'short',
													month: 'short',
													day: 'numeric',
												})}{' '}
												-{' '}
												{selectedRange.to.toLocaleDateString('en-US', {
													weekday: 'short',
													month: 'short',
													day: 'numeric',
												})}
											</p>

											<div className="mt-4 p-4 bg-orange-50 rounded-lg space-y-2">
												<div className="flex justify-between">
													<span className="text-orange-800">Base Rate:</span>
													<span className="font-semibold">
														${(totalPrice / nights).toFixed(2)}/night
													</span>
												</div>
												<div className="flex justify-between">
													<span className="text-orange-800">
														Number of Nights:
													</span>
													<span className="font-semibold">{nights} nights</span>
												</div>
												<hr className="border-orange-200" />
												<div className="flex justify-between font-bold">
													<span className="text-orange-800">
														Room Rate Total:
													</span>
													<span>${totalPrice.toFixed(2)}</span>
												</div>
												<p className="text-sm text-muted-foreground mt-1">
													*Room rate only - service fees and taxes added at
													checkout
												</p>
											</div>
										</div>
									) : (
										<div className="text-center py-8">
											<CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
											<p className="text-muted-foreground">
												Select your check-in and check-out dates to see pricing
												and availability
											</p>
											<p className="text-sm text-muted-foreground mt-2">
												Minimum stay: 1 nights • Maximum stay: 30 nights
											</p>
										</div>
									)}
								</CardContent>
							</Card>

							{selectedRange?.from && selectedRange?.to && (
								<Card className="border-accent/20 bg-accent/10">
									<CardContent className="p-6">
										<h4 className="font-semibold text-accent-foreground mb-2">
											Ready to book these dates?
										</h4>
										<p className="text-sm text-muted-foreground mb-4">
											Continue with your reservation for the Texas Room
										</p>
										<Button
											className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
											onClick={handleBookNow}
										>
											Book Now - {selectedRange.from.toLocaleDateString()} to{' '}
											{selectedRange.to.toLocaleDateString()}
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
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="text-2xl text-accent-foreground">
								Your Texas Getaway
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="prose prose-lg max-w-none">
								<p className="text-foreground/90 leading-relaxed mb-6">
									The Texas Room offers a private entrance for a peaceful,
									independent stay. Inside you'll find a convenient kitchenette
									with a coffee maker, refrigerator, and microwave—plus plenty
									of space for your belongings.
								</p>
								<p className="text-foreground/90 leading-relaxed">
									The Texas Room reflects the spirit of the Lone Star State with
									its warm décor and distinctive touches. Relax in a cozy
									king-sized bed in a light-filled space, and enjoy modern
									comforts including a TV with Prime Video and Netflix, a
									ceiling fan, electric fireplace. The private attached bathroom
									features an antique clawfoot bathtub—perfect for a long,
									relaxing soak—(please note: no walk-in shower). A separate
									work space and all the amenities you need complete this
									uniquely Texan getaway.
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
							<Coffee className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Kitchenette</h3>
							<p className="text-sm text-muted-foreground">
								Coffee maker, refrigerator, microwave
							</p>
						</Card>

						<Card className="text-center p-6">
							<Bath className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Clawfoot Tub</h3>
							<p className="text-sm text-muted-foreground">
								Antique bathtub (no walk-in shower)
							</p>
						</Card>

						<Card className="text-center p-6">
							<Tv className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Entertainment</h3>
							<p className="text-sm text-muted-foreground">
								TV with Prime Video & Netflix
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wind className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Climate Control</h3>
							<p className="text-sm text-muted-foreground">
								Ceiling fan & electric fireplace
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wifi className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Work Space</h3>
							<p className="text-sm text-muted-foreground">
								Dedicated area with WiFi
							</p>
						</Card>

						<Card className="text-center p-6">
							<Car className="w-8 h-8 text-accent mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Private Entrance</h3>
							<p className="text-sm text-muted-foreground">
								Independent access
							</p>
						</Card>

						<Card className="text-center p-6">
							<div className="w-8 h-8 bg-accent rounded mx-auto mb-4 flex items-center justify-center">
								<span className="text-accent-foreground text-sm font-bold">
									K
								</span>
							</div>
							<h3 className="font-semibold mb-2">King Bed</h3>
							<p className="text-sm text-muted-foreground">
								Spacious sleeping for two
							</p>
						</Card>

						<Card className="text-center p-6">
							<div className="w-8 h-8 bg-accent rounded mx-auto mb-4 flex items-center justify-center">
								<span className="text-accent-foreground text-sm font-bold">
									★
								</span>
							</div>
							<h3 className="font-semibold mb-2">Texas Charm</h3>
							<p className="text-sm text-muted-foreground">
								Warm décor & distinctive touches
							</p>
						</Card>
					</div>
				</div>
			</section>

			{/* Special Features */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<Card className="bg-accent/10 border-accent/20">
						<CardHeader>
							<CardTitle className="text-2xl text-accent-foreground">
								Texas Room Special Features
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid md:grid-cols-2 gap-6">
								<div>
									<h3 className="font-semibold text-lg mb-2 text-accent">
										Antique Clawfoot Tub
									</h3>
									<p className="text-muted-foreground">
										Relax and unwind in our beautiful antique clawfoot
										bathtub—perfect for a long, luxurious soak after exploring
										Dublin and the surrounding area.
									</p>
								</div>
								<div>
									<h3 className="font-semibold text-lg mb-2 text-accent">
										Texas-Themed Décor
									</h3>
									<p className="text-muted-foreground">
										Immerse yourself in true Lone Star State style with warm
										colors, distinctive touches, and décor that reflects the
										spirit of Texas.
									</p>
								</div>
							</div>
							<div className="mt-6 p-4 bg-accent/20 rounded-lg">
								<p className="text-sm text-accent-foreground font-medium">
									<strong>Please Note:</strong> The Texas Room features a
									beautiful antique clawfoot tub but does not have a walk-in
									shower. Perfect for guests who enjoy relaxing baths!
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			{/* Booking CTA */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<Card className="bg-accent/10 border-accent/20">
						<CardHeader>
							<CardTitle className="text-2xl text-accent-foreground">
								Ready to Experience Texas Charm?
							</CardTitle>
							<CardDescription className="text-base">
								Book your stay in the uniquely Texan Texas Room
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground mb-6">
								Book your stay directly with us for the best rates and
								personalized service.
							</p>
							<div className="flex flex-col sm:flex-row gap-4 justify-center">
								<Button
									className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-3 rounded-md font-medium transition-colors"
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
									className="border border-accent text-accent hover:bg-accent/10 px-8 py-3 rounded-md font-medium transition-colors inline-flex items-center justify-center"
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
