import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';

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

const GALLERY_IMAGE_IDS = [
	'29931e5a-4c05-46e8-bab3-6340860d5e43',
	'694c24dc-acaf-42e0-a564-87cf6591c2d3',
	'70869469-cf8d-4106-a097-5a094101c444',
	'73f7d15b-59b7-40bf-9aa8-96d40e3e71dd',
	'7dad57f4-0301-4ff0-b44f-ef88c88e01f5',
	'7ec19df2-0b06-4d10-8777-3558acb41689',
	'aca4abb9-0658-4ebf-ab13-b261430da6ea',
	'cb8e21a3-3a0c-4844-9eb8-37afbe8de80c',
	'd71e61ca-4388-44d9-b301-61bf493f5473',
	'e0954657-f5fa-4fa3-bd69-3f9ec2570401',
	'e5edfd3a-864f-4250-ac62-955e5ae86b5d',
];

const DESCRIPTION = [
	"Your suite offers a private entrance for complete seclusion. Step across your own deck to the main door, which opens into a bright enclosed sun porch. To the left, you'll find a convenient kitchenette with a coffee maker, refrigerator, microwave and an ironing board — plus ample space for your luggage and clothing.",
	'Straight ahead, the Rose Room awaits, featuring a cozy queen-sized bed in a light-filled space with a large picture window. Enjoy modern comforts including a TV with Prime Video and Netflix, a ceiling fan, and electric fireplace. The suite also includes a walk-in shower, a separate work space, and everything you need for a comfortable, private stay.',
];

const AMENITIES: RoomAmenity[] = [
	{
		icon: 'tabler:microwave',
		title: 'Kitchenette',
		description: 'Coffee maker, refrigerator, microwave',
	},
	{
		icon: 'mingcute:shower-line',
		title: 'Walk-in Shower',
		description: 'Private en-suite bathroom',
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
		icon: 'tabler:car',
		title: 'Private Entrance',
		description: 'Independent access via deck',
	},
	{
		icon: 'tabler:bed',
		title: 'Queen Bed',
		description: 'Comfortable sleeping for two',
	},
	{
		icon: 'tabler:bolt',
		title: 'Modern Comforts',
		description: 'All essential amenities included',
	},
];

function RoseRoomPage() {
	const room = Route.useLoaderData();

	return (
		<div className="bg-background">
			<RoomHero
				imageUrl={roomHeroImage(
					'rose-room',
					'7ec19df2-0b06-4d10-8777-3558acb41689',
				)}
				icon="lucide:rose"
				iconClassName="text-rose-400"
				title="Rose Room"
				titleClassName="bg-linear-to-r from-rose-700 via-pink-200 to-rose-700 font-fleur"
				tagline="Leave your worries behind in this spacious and tranquil retreat."
			/>

			<RoomBookingPanel
				room={room}
				backgroundClassName="from-rose-200"
				otherRoom={{
					to: '/rooms/texas-room',
					name: 'Texas Room',
					icon: 'game-icons:texas',
					iconClassName: 'text-red-400',
				}}
			/>

			<RoomGallerySection
				roomName={room.name}
				images={roomGalleryImages('rose-room', 'Rose Room', GALLERY_IMAGE_IDS)}
			/>

			<RoomDetailsSection
				title="Your Private Retreat"
				titleClassName="font-fleur text-4xl"
				cardClassName="border-primary/20"
				paragraphs={DESCRIPTION}
				icon={<Icon icon="noto:rose" className="size-40" />}
			/>

			<RoomAmenities amenities={AMENITIES} />

			<RoomBookingCta
				title="Ready to Book?"
				description="Experience the tranquil charm of the Rose Room"
			/>
		</div>
	);
}
