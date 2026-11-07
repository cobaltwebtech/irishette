import { Icon } from '@iconify/react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import RoomAvailabilityCalendar from '@/components/RoomAvailabilityCalendar';
import BookingInfo from '@/components/RoomBookingInfo';
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
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.rooms.get.queryOptions({ slug: 'rose-room' }),
		),
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
	const room = Route.useLoaderData();

	// Room information

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

	// Start a booking for this room (also replaces drafts saved with an old
	// room id). The room comes from the route loader.
	useEffect(() => {
		if (booking.roomId !== room.id) {
			booking.actions.initializeBooking(
				room.id,
				room.slug,
				room.name,
				room.maxGuests,
			);
		}
	}, [booking.roomId, booking.actions, room]);

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
			// Clear dates and pricing if no range selected
			booking.actions.setDates('', '');
			booking.actions.setPricing({
				basePrice: 0,
				nights: 0,
				subtotal: 0,
				taxes: 0,
				fees: 0,
				totalAmount: 0,
				currency: 'USD',
			});
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
		void navigate({ to: '/booking' });
		console.log('Starting booking process with data:', booking.summary);
	};

	return (
		<div className="bg-background">
			{/* Hero Section */}
			<section className="relative flex h-[50vh] min-h-[500px] items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
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
				<div className="relative z-10 container mx-auto max-w-4xl px-4 text-center">
					<div className="mb-4 flex justify-center text-rose-400">
						<Icon icon="lucide:rose" className="size-24" />
					</div>
					<h1 className="mb-6 bg-linear-to-r from-rose-700 via-pink-200 to-rose-700 bg-clip-text font-fleur text-4xl font-black text-transparent md:text-6xl lg:text-7xl">
						Rose Room
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-xl font-medium text-popover italic drop-shadow-md md:text-2xl">
						Leave your worries behind in this spacious and tranquil retreat.
					</p>
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
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
							<Icon icon="tabler:calendar-check" className="size-6" />
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
							<Icon icon="tabler:photo-down" className="size-6" />
							View Room Photos
						</Button>
					</div>
				</div>
			</section>

			{/* Availability Calendar */}
			<section
				className="scroll-mt-20 bg-linear-to-b from-rose-200 to-background px-4 py-16"
				data-calendar-section
			>
				<div className="container mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-4 flex flex-col items-center justify-center gap-2 text-3xl font-bold">
							<Icon
								icon="tabler:calendar-week"
								className="size-12 text-accent"
							/>
							<span>Select Dates to Book Now</span>
						</h2>
						<p className="text-lg text-muted-foreground">
							Select your preferred dates to see availability and pricing
						</p>
					</div>

					{/* Container for Calendar and Booking Info */}
					<div className="grid justify-center gap-8 lg:grid-cols-2">
						{/* Calendar */}
						<div className="flex justify-center">
							<div className="w-full max-w-2xl">
								<RoomAvailabilityCalendar
									roomSlug="rose-room"
									selectedDateRange={selectedDateRange}
									onDateRangeSelect={handleDateRangeSelect}
									minNights={1}
									maxNights={30}
								/>
							</div>
						</div>

						{/* Booking Information */}
						<BookingInfo
							selectedDateRange={selectedDateRange}
							totalPrice={totalPrice}
							nights={nights}
							onBookNow={handleBookNow}
							roomName="Rose Room"
						/>
					</div>
					<div className="mt-8 flex flex-col items-center gap-4">
						<p>
							Can't find the dates you need? Check out the Texas Room
							availability.
						</p>
						<Button asChild variant="secondary">
							<Link to="/rooms/texas-room">
								<Icon icon="game-icons:texas" className="size-6 text-red-400" />
								View Texas Room
							</Link>
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
			<section className="scroll-mt-20 px-4 py-16" data-gallery-section>
				<div className="container mx-auto max-w-4xl">
					<h2 className="mb-12 text-center text-3xl font-bold">
						Rose Room Gallery
					</h2>
					<RoomGallery
						images={roseRoomImages}
						roomName="Rose Room"
						className="mx-auto max-w-4xl"
						mainImageHeight={500}
						thumbImageHeight={100}
						thumbsPerView={5}
					/>
				</div>
			</section>

			{/* Room Description */}
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-primary/20">
						<CardHeader>
							<CardTitle className="text-center font-fleur text-4xl text-primary">
								Your Private Retreat
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col items-center gap-8 lg:flex-row">
							<div className="space-y-4">
								<p className="text-justify leading-relaxed">
									Your suite offers a private entrance for complete seclusion.
									Step across your own deck to the main door, which opens into a
									bright enclosed sun porch. To the left, you'll find a
									convenient kitchenette with a coffee maker, refrigerator,
									microwave and an ironing board — plus ample space for your
									luggage and clothing.
								</p>
								<p className="text-justify leading-relaxed">
									Straight ahead, the Rose Room awaits, featuring a cozy
									queen-sized bed in a light-filled space with a large picture
									window. Enjoy modern comforts including a TV with Prime Video
									and Netflix, a ceiling fan, and electric fireplace. The suite
									also includes a walk-in shower, a separate work space, and
									everything you need for a comfortable, private stay.
								</p>
							</div>
							<div>
								<Icon icon="noto:rose" className="size-40" />
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			{/* Amenities */}
			<section className="bg-muted/80 px-4 py-16">
				<div className="container mx-auto max-w-6xl">
					<h2 className="mb-12 text-center text-3xl font-bold">
						Room Amenities
					</h2>

					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
						<Card className="p-6 text-center">
							<Icon
								icon="tabler:microwave"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Kitchenette</h3>
							<p className="text-sm text-muted-foreground">
								Coffee maker, refrigerator, microwave
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="mingcute:shower-line"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Walk-in Shower</h3>
							<p className="text-sm text-muted-foreground">
								Private en-suite bathroom
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:device-tv-old"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Entertainment</h3>
							<p className="text-sm text-muted-foreground">
								TV with Prime Video & Netflix
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:wind"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Climate Control</h3>
							<p className="text-sm text-muted-foreground">
								Ceiling fan & electric fireplace
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:wifi"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Work Space</h3>
							<p className="text-sm text-muted-foreground">
								Dedicated area with WiFi
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:car"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Private Entrance</h3>
							<p className="text-sm text-muted-foreground">
								Independent access via deck
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:bed"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Queen Bed</h3>
							<p className="text-sm text-muted-foreground">
								Comfortable sleeping for two
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:bolt"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Modern Comforts</h3>
							<p className="text-sm text-muted-foreground">
								All essential amenities included
							</p>
						</Card>
					</div>
				</div>
			</section>

			{/* Booking CTA */}
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-4xl text-center">
					<Card className="border-accent/20 bg-accent/10">
						<CardHeader>
							<CardTitle className="text-2xl">Ready to Book?</CardTitle>
							<CardDescription className="text-base">
								Experience the tranquil charm of the Rose Room
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="mb-6 text-muted-foreground">
								Book your stay directly with us for the best rates and
								personalized service.
							</p>
							<div className="flex flex-col justify-center gap-4 sm:flex-row">
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
