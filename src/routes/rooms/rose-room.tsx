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
			booking.actions.initializeBooking(
				'biolbnhax7ZK9ctPpb2rq',
				roomSlug,
				'Rose Room',
			); // Actual Rose Room ID from database
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

		// Validate that we have the minimum required booking data (room, dates)
		// We check this directly rather than using canProceed() which validates based on currentStep
		if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
			console.warn('Booking validation failed: Missing room or dates');
			return;
		}

		// Ensure we're starting from the auth step
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
					<div className="flex justify-center mb-4 text-rose-400">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							className="size-24"
						>
							<title>Rose Icon</title>
							<g
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
							>
								<path d="M17 10h-1a4 4 0 1 1 4-4v.534" />
								<path d="M17 6h1a4 4 0 0 1 1.42 7.74l-2.29.87a6 6 0 0 1-5.339-10.68l2.069-1.31M4.5 17c2.8-.5 4.4 0 5.5.8s1.8 2.2 2.3 3.7c-2 .4-3.5.4-4.8-.3c-1.2-.6-2.3-1.9-3-4.2" />
								<path d="M9.77 12C4 15 2 22 2 22" />
								<circle cx="17" cy="8" r="2" />
							</g>
						</svg>
					</div>
					<h1 className="font-fleur text-4xl md:text-6xl lg:text-7xl font-black mb-6 bg-gradient-to-r from-rose-700 via-pink-200 to-rose-700 bg-clip-text text-transparent">
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
				className="py-16 px-4 scroll-mt-20 bg-linear-to-b from-rose-200 to-background"
				data-calendar-section
			>
				<div className="container mx-auto max-w-5xl">
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
						<p>
							<span className="bg-red-300 font-bold">
								DO WE NEED ANYTHING ABOUT PETS OR OTHER NOT ALLOWED ITEMS
								(ALCOHOL, MUSIC, ETC)?
							</span>
						</p>
					</div>
				</div>
			</section>

			{/* Photo Gallery */}
			<section className="py-16 px-4 scroll-mt-20" data-gallery-section>
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
							<CardTitle className="font-fleur text-4xl text-primary text-center">
								Your Private Retreat
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col lg:flex-row gap-8 items-center">
							<div className="space-y-4">
								<p className="leading-relaxed text-justify">
									Your suite offers a private entrance for complete seclusion.
									Step across your own deck to the main door, which opens into a
									bright enclosed sun porch. To the left, you'll find a
									convenient kitchenette with a coffee maker, refrigerator,
									microwave and an ironing board — plus ample space for your
									luggage and clothing.
								</p>
								<p className="leading-relaxed text-justify">
									Straight ahead, the Rose Room awaits, featuring a cozy
									queen-sized bed in a light-filled space with a large picture
									window. Enjoy modern comforts including a TV with Prime Video
									and Netflix, a ceiling fan, and electric fireplace. The suite
									also includes a walk-in shower, a separate work space, and
									everything you need for a comfortable, private stay.
								</p>
							</div>
							<div>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="128"
									height="128"
									viewBox="0 0 128 128"
								>
									<title>Rose Graphic</title>
									<path
										fill="#307d31"
										d="m56.81 85.29l21.86.17s-1.74 5.65-3.18 7.87c-2.35 3.6-3.52 5.44-4.52 9.13c-1.55 5.68-1.42 10.05-1.42 10.05s1.21-.42 2.68 0c1.79.51 2.76 1.7 2.6 2.43c-.15.65-2.14.21-3.52 1.59c-1.09 1.09-1.51 3.02-1.68 4.27c-.17 1.26-.34 2.85-2.68 3.18c-2.35.34-5.86.59-6.62-.59c-.75-1.17-.34-21.61-.34-21.61z"
									/>
									<path
										fill="#5c9823"
										d="M56.56 80.76c-.42.75-10.32 2.53-10.32 2.53s-3.31 1.77-4.56 7.55c-.68 3.13-.53 9.47-1.12 11.69c-.84 3.18-4.36 5.03-4.19 5.78s3.24.7 5.61-.34c5.36-2.35 6.3-7.21 8.04-11.39c1.68-4.02 4.86-6.13 4.86-6.13s-.75 2.92-.43 6.14c.27 2.77 1.14 6.3 0 9.73c-1.09 3.27-2.62 5.24-2.01 5.54c.46.22 5.92-.33 8.1-5.11c2.41-5.28 2.58-9.61 4.02-12.71c1.59-3.43 4.62-4.89 4.62-4.89s2.15 1.26 4.78 4.94c2.93 4.1 5.38 7.55 6.96 9.67c3.7 4.98 8.83 6.55 8.99 5.71c.25-1.34-2.47-3.49-3.02-6.11c-1.35-6.45.5-9.54-1.03-14.49c-2.2-7.15-7.39-7.28-9.19-7.62c-.42-.06-20.11-.49-20.11-.49"
									/>
									<path
										fill="#96010c"
										d="M47.31 44.34c-1.13-1.01-17.87-13.21-17.87-13.21l-.25-7.42s-4.1-7.75.62-13.52c4.1-5.01 9.57-3.59 9.57-3.59s2.74-3.45 7.52-3.69c6.11-.31 9.09 4.83 9.09 4.83l27.55 4.53l15.47 10.06s2.29-.74 4.19.6c1.98 1.39 1.33 4.31 1.11 5.62c-.21 1.25-20.65 17.56-20.65 17.56l2.14 31.96l-7.14 7.97s-1 .98-3.05 1.24c-1.19.15-2.72-.33-2.72-.33l-4.45-12.78z"
									/>
									<path
										fill="#af0c1b"
										d="m83.15 6.86l-3.72.28l-2.61 2.19l.93 4.21s.12 3.15-2.36 4.66s-7.35 3.99-7.35 3.99l-3.36 5.56s-2.16-.71-5.68-2.52c-3.29-1.7-7.5-5.58-7.5-5.58l-7.53-.51s-1.44-.13-2.65 1.15c-1.74 1.86-1.12 5.8 2.29 9.41c3.28 3.47 10.38 7.7 11.96 8.87s3.99 2.67 5.36 3.44c1.32.74 2.9 1.8 3.59 1.67c.69-.14 1.71-2.49 4.94-4.76s6.39-4.19 11.55-5.98s10.11-3.85 11.62-4.81s-.55-7.49-2.41-11.48s-6.94-10.2-7.07-9.79"
									/>
									<path
										fill="#db132c"
										d="M65.07 23.98c-1.27 1.68-1.03 3.64-1.03 3.64s2.77 1.66 5.5 2.61c4.95 1.72 16.09 1.24 21.45-1.17s7.98-4.49 8.8-7.01c.96-2.96 1.76-8.94-4-13.55c-6.6-5.29-16.56-2.4-16.56-1.02s3.99.28 3.99 5.29s-4.4 8.04-8.87 8.66s-7.36 0-9.28 2.55"
									/>
									<path
										fill="#f71538"
										d="M42.24 19.65s-.51-2.02 1.17-3.64c2.54-2.48 5.78-3.78 7.63-5.78s4.48-5.79 10.93-6.67c9.56-1.31 15.74 2.27 17.12 6.67s-1.24 5.91-3.92 5.98s-4.17-1.19-9.08-.34c-8.32 1.44-11.21 5.91-11.96 6.33c-.76.41-3.23-1.03-6.6-1.93c-2.43-.65-4.19-.49-5.29-.62"
									/>
									<path
										fill="#cd0e1f"
										d="M69.62 48.38s1.7-5.65 7.25-9.23c5.56-3.58 9.61-3.67 16.68-6.88s9.51-5.32 10.64-6.06c1.16-.76 2.21-1.45 3.02-.12c.52.86-.38 4.38-2.77 7.8c-2.44 3.49-4.84 5.41-6.66 11.42c-2.41 7.93 2.22 15.14-2.72 27.88c-1.6 4.12-5.35 7.89-8.84 10.34s-8.52 3-8.52 3s1.79-1.25 2.77-5.85c.48-2.26 1.2-6.27.65-10.54c-1.57-12.21-11.5-21.76-11.5-21.76"
									/>
									<path
										fill="#e2122d"
										d="M31.74 46.68c.12 2.68-1.14 12.43.49 20.26c1.28 6.16 7.62 17.05 19.49 20.25c10.92 2.95 22.61-.09 22.61-.09s4.41-7.45 2.18-18.31c-2.43-11.84-14.26-20.64-27.9-27.38c-16.39-8.1-19.36-17.86-19.36-17.86s-5.39-1.41-6.74 3.44c-2.07 7.44 9.05 15.64 9.23 19.69"
									/>
								</svg>
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
