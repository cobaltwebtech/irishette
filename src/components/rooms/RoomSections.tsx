import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { type RoomImage, RoomGallery } from '@/components/RoomGallery';
import { scrollToSection } from '@/components/rooms/scroll-to-section';
import { Button, buttonVariants } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { cn } from '@/utils/twMerge';

/** Photo gallery section (target of the hero's "View Room Photos"). */
export function RoomGallerySection({
	roomName,
	images,
}: {
	roomName: string;
	images: RoomImage[];
}) {
	return (
		<section className="scroll-mt-20 px-4 py-16" data-gallery-section>
			<div className="container mx-auto max-w-4xl">
				<h2 className="mb-12 text-center text-3xl font-bold">
					{roomName} Gallery
				</h2>
				<RoomGallery
					images={images}
					roomName={roomName}
					className="mx-auto max-w-4xl"
					mainImageHeight={500}
					thumbImageHeight={100}
					thumbsPerView={5}
				/>
			</div>
		</section>
	);
}

/** Room description card: a title, paragraphs and a decorative icon. */
export function RoomDetailsSection({
	title,
	titleClassName,
	cardClassName,
	paragraphs,
	icon,
}: {
	title: string;
	/** Font and size classes for the title. */
	titleClassName: string;
	/** Border colour class for the card. */
	cardClassName: string;
	paragraphs: string[];
	icon: ReactNode;
}) {
	return (
		<section className="px-4 py-16">
			<div className="container mx-auto max-w-4xl">
				<Card className={cardClassName}>
					<CardHeader>
						<CardTitle
							className={cn('text-center text-primary', titleClassName)}
						>
							{title}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col items-center gap-8 lg:flex-row">
						<div className="space-y-4">
							{paragraphs.map((text) => (
								<p key={text} className="text-justify leading-relaxed">
									{text}
								</p>
							))}
						</div>
						<div>{icon}</div>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}

export interface RoomAmenity {
	icon: string;
	title: string;
	description: ReactNode;
}

/** Grid of amenity cards. */
export function RoomAmenities({ amenities }: { amenities: RoomAmenity[] }) {
	return (
		<section className="bg-muted/80 px-4 py-16">
			<div className="container mx-auto max-w-6xl">
				<h2 className="mb-12 text-center text-3xl font-bold">Room Amenities</h2>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
					{amenities.map((amenity) => (
						<Card key={amenity.title} className="p-6 text-center">
							<Icon
								icon={amenity.icon}
								className="mx-auto mb-4 size-8 text-accent"
							/>
							<h3 className="mb-2 font-semibold">{amenity.title}</h3>
							<p className="text-sm text-muted-foreground">
								{amenity.description}
							</p>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}

/** Closing "Ready to book?" card. */
export function RoomBookingCta({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<section className="px-4 py-16">
			<div className="container mx-auto max-w-4xl text-center">
				<Card className="border-accent/20 bg-accent/10">
					<CardHeader>
						<CardTitle className="text-2xl">{title}</CardTitle>
						<CardDescription className="text-base">
							{description}
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
								onClick={() => scrollToSection('calendar')}
							>
								Check Availability
							</Button>
							<Link
								to="/"
								data-slot="button"
								className={cn(
									buttonVariants({ variant: 'outline', size: 'lg' }),
								)}
							>
								View All Rooms
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
