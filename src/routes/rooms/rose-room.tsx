import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
	Bath,
	Bed,
	CalendarCheck,
	Calendar as CalendarIcon,
	Car,
	Coffee,
	Image as ImageIcon,
	Tv,
	Wifi,
	Wind,
	Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import BookingInformation from '@/components/BookingInformation';
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

	// Scroll to top when component mounts
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

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
			{/* Hero Section */}
			<section className="relative h-[50vh] min-h-[500px] flex items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
				{/* Background Image */}
				<div
					className="absolute inset-0 bg-cover bg-center bg-no-repeat"
					style={{
						backgroundImage: `url('https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/rose-room/7ec19df2-0b06-4d10-8777-3558acb41689.jpg')`,
					}}
				/>

				{/* Overlay for better text readability */}
				<div className="absolute inset-0 bg-black/60" />

				{/* Content */}
				<div className="relative z-10 container mx-auto max-w-4xl text-center px-4">
					<h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 bg-gradient-to-r from-rose-800 via-pink-400 to-rose-800 bg-clip-text text-transparent">
						Rose Room
					</h1>
					<p className="text-xl md:text-2xl italic text-popover mb-8 font-medium drop-shadow-md max-w-3xl mx-auto">
						Leave your worries behind in this spacious and tranquil retreat.
					</p>
					<div className="flex flex-col sm:flex-row gap-4 justify-center">
						<Button
							variant="accent"
							size="lg"
							onClick={() => {
								const calendarSection = document.querySelector(
									'[data-calendar-section]',
								);
								if (calendarSection) {
									calendarSection.scrollIntoView({ behavior: 'smooth' });
								}
							}}
						>
							<CalendarCheck className="size-6" />
							Book Rose Room
						</Button>
						<Button
							variant="outline"
							size="lg"
							className="text-background"
							onClick={() => {
								const gallerySection = document.querySelector(
									'[data-gallery-section]',
								);
								if (gallerySection) {
									gallerySection.scrollIntoView({ behavior: 'smooth' });
								}
							}}
						>
							<ImageIcon className="size-6" />
							View Room Photos
						</Button>
					</div>
				</div>
			</section>

			{/* Availability Calendar */}
			<section
				className="py-16 px-4 bg-gradient-to-b from-secondary to-background"
				data-calendar-section
			>
				<div className="container mx-auto max-w-screen-lg">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-2">
							<CalendarIcon className="w-8 h-8 text-accent" />
							Select Dates to Book Now
						</h2>
						<p className="text-muted-foreground text-lg">
							Select your preferred dates to see availability and pricing
						</p>
					</div>

					<div className="grid lg:grid-cols-2 gap-8 justify-center">
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
						<BookingInformation
							selectedDateRange={selectedDateRange}
							totalPrice={totalPrice}
							nights={nights}
							onBookNow={handleBookNow}
							roomName="Rose Room"
						/>
					</div>
					<div className="flex flex-col items-center mt-8 gap-4">
						<p>
							Can't find the dates you need? Check out the Texas Room
							availability.
						</p>
						<Button asChild variant="secondary">
							<Link to="/rooms/texas-room">View Texas Room</Link>
						</Button>
					</div>
				</div>
			</section>

			{/* Photo Gallery */}
			<section className="py-16 px-4" data-gallery-section>
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
			<section className="py-16 px-4 bg-muted/80">
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
							<Bed className="w-8 h-8 text-primary mx-auto mb-4" />
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
					<Card className="bg-accent/10 border-accent/20">
						<CardHeader>
							<CardTitle className="text-2xl">Ready to Book?</CardTitle>
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
									variant="accent"
									size="lg"
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
								<Button asChild variant="outline" size="lg">
									<Link to="/">View All Rooms</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
