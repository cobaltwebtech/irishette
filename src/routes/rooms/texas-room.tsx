import { Icon } from '@iconify/react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Image } from '@unpic/react';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import RoomAvailabilityCalendar from '@/components/RoomAvailabilityCalendar';
import BookingInfo from '@/components/RoomBookingInfo';
import { RoomGallery } from '@/components/RoomGallery';
import { Button, buttonVariants } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useBookingStore } from '@/stores';

export const Route = createFileRoute('/rooms/texas-room')({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.rooms.get.queryOptions({ slug: 'texas-room' }),
		),
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
	const room = Route.useLoaderData();

	// Room information

	// Texas Room images from Cloudinary
	const texasRoomImages = [
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/9abc8cd6-f843-4e67-9142-eb473adff4f5.jpg',
			alt: 'Texas Room - Image 1',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/67b358eb-1af2-4dae-9114-b74636c32119.jpg',
			alt: 'Texas Room - Image 2',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/2438d940-5419-4f77-985c-081d766b2a77.jpg',
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
		if (!selectedRange?.from || !selectedRange?.to) {
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
						backgroundImage: `url('https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/texas-room/9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac.jpg')`,
					}}
				/>

				{/* Overlay for better text readability */}
				<div className="absolute inset-0 bg-black/60" />

				{/* Content */}
				<div className="relative z-10 container mx-auto max-w-4xl px-4 text-center">
					<div className="mb-4 flex justify-center text-blue-500">
						<Icon icon="game-icons:texas" className="size-24" />
					</div>
					<h1 className="mb-6 bg-linear-to-br from-blue-500 from-30% via-white to-red-500 to-70% bg-clip-text font-rye text-4xl font-black text-transparent md:text-6xl lg:text-7xl">
						Texas Room
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-xl font-medium text-popover italic drop-shadow-md md:text-2xl">
						Experience true Texas charm in this spacious and inviting retreat.
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
							Book Texas Room
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
				className="scroll-mt-20 bg-linear-to-b from-blue-200 to-background px-4 py-16"
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

					<div className="grid justify-center gap-8 lg:grid-cols-2">
						{/* Calendar */}
						<RoomAvailabilityCalendar
							roomSlug="texas-room"
							selectedDateRange={selectedRange}
							onDateRangeSelect={handleRangeSelect}
							minNights={1}
							maxNights={30}
						/>

						{/* Booking Information */}
						<BookingInfo
							selectedDateRange={selectedRange}
							totalPrice={totalPrice}
							nights={nights}
							onBookNow={handleBookNow}
							roomName="Texas Room"
						/>
					</div>
				</div>
				<div className="mt-8 flex flex-col items-center gap-4">
					<p>
						Can't find the dates you need? Check out the Rose Room availability.
					</p>
					<Link
						to="/rooms/rose-room"
						data-slot="button"
						className={buttonVariants({ variant: 'secondary' })}
					>
						<Icon icon="lucide:rose" className="size-6 text-rose-400" />
						View Rose Room
					</Link>
					<p>
						<span className="bg-red-300 font-bold">
							DO WE NEED ANYTHING ABOUT PETS OR OTHER NOT ALLOWED ITEMS
							(ALCOHOL, MUSIC, ETC)?
						</span>
					</p>
				</div>
			</section>

			{/* Photo Gallery */}
			<section className="scroll-mt-20 px-4 py-16" data-gallery-section>
				<div className="container mx-auto max-w-4xl">
					<h2 className="mb-12 text-center text-3xl font-bold">
						Texas Room Gallery
					</h2>
					<RoomGallery
						images={texasRoomImages}
						roomName="Texas Room"
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
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="text-center font-rye text-3xl text-primary">
								Your Texas Getaway
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col items-center gap-8 lg:flex-row">
							<div className="space-y-4">
								<p className="text-justify leading-relaxed">
									The Texas Room offers a private entrance for a peaceful,
									independent stay. Inside you'll find a convenient kitchenette
									with a coffee maker, refrigerator, and microwave—plus plenty
									of space for your belongings.
								</p>
								<p className="text-justify leading-relaxed">
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
							<div>
								<Icon icon="openmoji:texas-flag" className="size-50" />
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
								icon="tabler:coffee"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Kitchenette</h3>
							<p className="text-sm text-muted-foreground">
								Coffee maker, refrigerator, microwave
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="tabler:bath"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Clawfoot Tub</h3>
							<p className="text-sm text-muted-foreground">
								Antique bathtub
								<br />
								(no walk-in shower)
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
								icon="tabler:car-suv"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Private Entrance</h3>
							<p className="text-sm text-muted-foreground">
								Independent access from your vehicle to the room
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="material-symbols:bed-outline-rounded"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">King Bed</h3>
							<p className="text-sm text-muted-foreground">
								Spacious sleeping for two
							</p>
						</Card>

						<Card className="p-6 text-center">
							<Icon
								icon="game-icons:texas"
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">Texas Charm</h3>
							<p className="text-sm text-muted-foreground">
								Warm décor & distinctive touches with a Texas vibe
							</p>
						</Card>
					</div>
				</div>
			</section>

			{/* Special Features */}
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-accent/20 bg-accent/10">
						<CardHeader>
							<CardTitle className="text-center text-2xl">
								Texas Room Special Features (need to update these images)
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-2">
									4
									<Image
										src="https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/b495460e-218d-4e2b-8b5b-3e87df2a4b43.avif"
										alt="Texas Room Clawfoot Tub"
										width={300}
										height={400}
										className="mx-auto rounded-lg"
									/>
									<h3 className="mb-2 text-center text-lg font-semibold text-accent">
										Antique Clawfoot Tub
									</h3>
									<p className="text-center text-muted-foreground">
										Relax and unwind in our beautiful antique clawfoot
										bathtub—perfect for a long, luxurious soak after exploring
										Dublin and the surrounding area.
									</p>
								</div>
								<div className="space-y-2">
									<Image
										src="https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/b2191747-41d4-4960-91fc-eaeefabddc3a.avif"
										alt="Texas Room Clawfoot Tub"
										width={300}
										height={400}
										className="mx-auto rounded-lg"
									/>
									<h3 className="mb-2 text-center text-lg font-semibold text-accent">
										Texas-Themed Décor
									</h3>
									<p className="text-center text-muted-foreground">
										Immerse yourself in true Lone Star State style with warm
										colors, distinctive touches, and décor that reflects the
										spirit of Texas.
									</p>
								</div>
							</div>
							<div className="mt-6 rounded-lg bg-accent/20 p-4">
								<p className="text-sm font-medium">
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
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-4xl text-center">
					<Card className="border-accent/20 bg-accent/10">
						<CardHeader>
							<CardTitle className="text-2xl">
								Ready to Experience Texas Charm?
							</CardTitle>
							<CardDescription className="text-base">
								Book your stay in the uniquely Texan Texas Room
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
								<Link
									to="/"
									data-slot="button"
									className={buttonVariants({ variant: 'outline', size: 'lg' })}
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
