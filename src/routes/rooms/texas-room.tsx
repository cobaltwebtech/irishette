import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { Image } from '@unpic/react';

import {
	roomGalleryImages,
	roomHeroImage,
} from '@/components/rooms/room-images';
import { RoomBookingPanel } from '@/components/rooms/RoomBookingPanel';
import { RoomHero } from '@/components/rooms/RoomHero';
import {
	type RoomAmenity,
	RoomAmenities,
	RoomBookingCta,
	RoomDetailsSection,
	RoomGallerySection,
} from '@/components/rooms/RoomSections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

const GALLERY_IMAGE_IDS = [
	'9abc8cd6-f843-4e67-9142-eb473adff4f5',
	'67b358eb-1af2-4dae-9114-b74636c32119',
	'2438d940-5419-4f77-985c-081d766b2a77',
	'9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac',
	'b2191747-41d4-4960-91fc-eaeefabddc3a',
	'b495460e-218d-4e2b-8b5b-3e87df2a4b43',
	'b665f34a-dd96-41ad-ad07-672cebefd93e',
	'dfb868ed-b654-4cd7-83c9-7f1a63b1c35a',
	'ef65e11c-d2d0-4d28-bc7f-ae0ea1e5c68c',
];

const DESCRIPTION = [
	"The Texas Room offers a private entrance for a peaceful, independent stay. Inside you'll find a convenient kitchenette with a coffee maker, refrigerator, and microwave—plus plenty of space for your belongings.",
	'The Texas Room reflects the spirit of the Lone Star State with its warm décor and distinctive touches. Relax in a cozy king-sized bed in a light-filled space, and enjoy modern comforts including a TV with Prime Video and Netflix, a ceiling fan, electric fireplace. The private attached bathroom features an antique clawfoot bathtub—perfect for a long, relaxing soak—(please note: no walk-in shower). A separate work space and all the amenities you need complete this uniquely Texan getaway.',
];

const AMENITIES: RoomAmenity[] = [
	{
		icon: 'tabler:coffee',
		title: 'Kitchenette',
		description: 'Coffee maker, refrigerator, microwave',
	},
	{
		icon: 'tabler:bath',
		title: 'Clawfoot Tub',
		description: (
			<>
				Antique bathtub
				<br />
				(no walk-in shower)
			</>
		),
	},
	{
		icon: 'tabler:device-tv-old',
		title: 'Entertainment',
		description: 'TV with Prime Video & Netflix',
	},
	{
		icon: 'tabler:wind',
		title: 'Climate Control',
		description: 'Ceiling fan & electric fireplace',
	},
	{
		icon: 'tabler:wifi',
		title: 'Work Space',
		description: 'Dedicated area with WiFi',
	},
	{
		icon: 'tabler:car-suv',
		title: 'Private Entrance',
		description: 'Independent access from your vehicle to the room',
	},
	{
		icon: 'material-symbols:bed-outline-rounded',
		title: 'King Bed',
		description: 'Spacious sleeping for two',
	},
	{
		icon: 'game-icons:texas',
		title: 'Texas Charm',
		description: 'Warm décor & distinctive touches with a Texas vibe',
	},
];

function TexasRoomPage() {
	const room = Route.useLoaderData();

	return (
		<div className="bg-background">
			<RoomHero
				imageUrl={roomHeroImage(
					'texas-room',
					'9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac',
				)}
				icon="game-icons:texas"
				iconClassName="text-blue-500"
				title="Texas Room"
				titleClassName="bg-linear-to-br from-blue-500 from-30% via-white to-red-500 to-70% font-rye"
				tagline="Experience true Texas charm in this spacious and inviting retreat."
			/>

			<RoomBookingPanel
				room={room}
				backgroundClassName="from-blue-200"
				otherRoom={{
					to: '/rooms/rose-room',
					name: 'Rose Room',
					icon: 'lucide:rose',
					iconClassName: 'text-rose-400',
				}}
			/>

			<RoomGallerySection
				roomName={room.name}
				images={roomGalleryImages(
					'texas-room',
					'Texas Room',
					GALLERY_IMAGE_IDS,
				)}
			/>

			<RoomDetailsSection
				title="Your Texas Getaway"
				titleClassName="font-rye text-3xl"
				cardClassName="border-accent/20"
				paragraphs={DESCRIPTION}
				icon={<Icon icon="openmoji:texas-flag" className="size-50" />}
			/>

			<RoomAmenities amenities={AMENITIES} />

			<TexasSpecialFeatures />

			<RoomBookingCta
				title="Ready to Experience Texas Charm?"
				description="Book your stay in the uniquely Texan Texas Room"
			/>
		</div>
	);
}

function TexasSpecialFeatures() {
	return (
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
	);
}
