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

export const Route = createFileRoute('/rooms/rose-room')({
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

	// Rose Room images from Cloudinary
	const roseRoomImages = [
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/29931e5a-4c05-46e8-bab3-6340860d5e43.jpg',
			alt: 'Rose Room - Image 1',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/694c24dc-acaf-42e0-a564-87cf6591c2d3.jpg',
			alt: 'Rose Room - Image 2',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/70869469-cf8d-4106-a097-5a094101c444.jpg',
			alt: 'Rose Room - Image 3',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/73f7d15b-59b7-40bf-9aa8-96d40e3e71dd.jpg',
			alt: 'Rose Room - Image 4',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/7dad57f4-0301-4ff0-b44f-ef88c88e01f5.jpg',
			alt: 'Rose Room - Image 5',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/7ec19df2-0b06-4d10-8777-3558acb41689.jpg',
			alt: 'Rose Room - Image 6',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/aca4abb9-0658-4ebf-ab13-b261430da6ea.jpg',
			alt: 'Rose Room - Image 7',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/cb8e21a3-3a0c-4844-9eb8-37afbe8de80c.jpg',
			alt: 'Rose Room - Image 8',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/d71e61ca-4388-44d9-b301-61bf493f5473.jpg',
			alt: 'Rose Room - Image 9',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/e0954657-f5fa-4fa3-bd69-3f9ec2570401.jpg',
			alt: 'Rose Room - Image 10',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/e5edfd3a-864f-4250-ac62-955e5ae86b5d.jpg',
			alt: 'Rose Room - Image 11',
		},
	];

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
			<section className="relative bg-gradient-to-b from-secondary to-background py-16 px-4">
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
							<CalendarIcon className="w-8 h-8 text-primary" />
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
							<Card className="border-primary/20">
								<CardHeader>
									<CardTitle className="text-primary">
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
														Room Rate for {nights} night
														{nights !== 1 ? 's' : ''}
													</span>
													<span className="text-rose-800 font-semibold">
														${totalPrice.toFixed(2)}
													</span>
												</div>
												<p className="text-sm text-muted-foreground">
													Base rate: $
													{nights > 0 ? (totalPrice / nights).toFixed(2) : '0'}
													/night
												</p>
												<p className="text-xs text-muted-foreground">
													*Room rate only - fees and taxes added at checkout
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
								<Card className="border-primary/20 bg-secondary">
									<CardContent className="p-6">
										<h4 className="font-semibold text-primary mb-2">
											Ready to book your stay?
										</h4>
										<p className="text-sm text-muted-foreground mb-4">
											Continue with your reservation for {nights} night
											{nights !== 1 ? 's' : ''} at the Rose Room
										</p>
										<Button
											className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
											onClick={handleBookNow}
										>
											Book Now - ${totalPrice.toFixed(2)} room rate for {nights}{' '}
											night
											{nights !== 1 ? 's' : ''}
										</Button>
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* Photo Gallery */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<h2 className="text-3xl font-bold text-center mb-12">
						Rose Room Gallery
					</h2>
					<RoomGallery
						images={roseRoomImages}
						roomName="Rose Room"
						className="max-w-4xl mx-auto"
						mainImageHeight={500}
						thumbImageHeight={100}
						thumbsPerView={5}
					/>
				</div>
			</section>

			{/* Room Description */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-primary/20">
						<CardHeader>
							<CardTitle className="text-2xl text-primary">
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
							<Coffee className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Kitchenette</h3>
							<p className="text-sm text-muted-foreground">
								Coffee maker, refrigerator, microwave
							</p>
						</Card>

						<Card className="text-center p-6">
							<Bath className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Walk-in Shower</h3>
							<p className="text-sm text-muted-foreground">
								Private en-suite bathroom
							</p>
						</Card>

						<Card className="text-center p-6">
							<Tv className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Entertainment</h3>
							<p className="text-sm text-muted-foreground">
								TV with Prime Video & Netflix
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wind className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Climate Control</h3>
							<p className="text-sm text-muted-foreground">
								Ceiling fan & electric fireplace
							</p>
						</Card>

						<Card className="text-center p-6">
							<Wifi className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Work Space</h3>
							<p className="text-sm text-muted-foreground">
								Dedicated area with WiFi
							</p>
						</Card>

						<Card className="text-center p-6">
							<Car className="w-8 h-8 text-primary mx-auto mb-4" />
							<h3 className="font-semibold mb-2">Private Entrance</h3>
							<p className="text-sm text-muted-foreground">
								Independent access via deck
							</p>
						</Card>

						<Card className="text-center p-6">
							<div className="w-8 h-8 bg-primary rounded mx-auto mb-4 flex items-center justify-center">
								<span className="text-primary-foreground text-sm font-bold">
									Q
								</span>
							</div>
							<h3 className="font-semibold mb-2">Queen Bed</h3>
							<p className="text-sm text-muted-foreground">
								Comfortable sleeping for two
							</p>
						</Card>

						<Card className="text-center p-6">
							<Zap className="w-8 h-8 text-primary mx-auto mb-4" />
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
					<Card className="bg-secondary border-primary/20">
						<CardHeader>
							<CardTitle className="text-2xl text-primary">
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
									className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-md font-medium transition-colors"
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
									className="border border-primary text-primary hover:bg-secondary px-8 py-3 rounded-md font-medium transition-colors inline-flex items-center justify-center"
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
