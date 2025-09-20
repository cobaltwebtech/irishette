import { createFileRoute, Link } from '@tanstack/react-router';
import { Image } from '@unpic/react';
import { Bed, BedDouble, Luggage, MapPinHouse } from 'lucide-react';
import { HeroSlider } from '@/components/HeroSlider';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

export const Route = createFileRoute('/')({
	component: HomePage,
});

function HomePage() {
	const heroImages = [
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/rose-room/7ec19df2-0b06-4d10-8777-3558acb41689.jpg',
			alt: 'Rose Room - Elegant bedroom with large window',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/texas-room/9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac.jpg',
			alt: 'Texas Room - Cozy king bed with fireplace',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/rose-room/cb8e21a3-3a0c-4844-9eb8-37afbe8de80c.jpg',
			alt: 'Rose Room - Private entrance with deck',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/texas-room/67b358eb-1af2-4dae-9114-b74636c32119.jpg',
			alt: 'Texas Room - Vintage porch view',
		},
		{
			src: 'https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/rose-room/aca4abb9-0658-4ebf-ab13-b261430da6ea.jpg',
			alt: 'Rose Room - Bright enclosed sun porch',
		},
	];

	return (
		<div className="min-h-screen bg-background">
			{/* Hero Section */}
			<section className="relative h-[50vh] min-h-[500px] flex items-center justify-center overflow-hidden">
				{/* Background Slideshow */}
				<HeroSlider images={heroImages} autoplayDelay={3000} />

				{/* Overlay for better text readability */}
				<div className="absolute inset-0 bg-black/60 z-10" />

				{/* Content */}
				<div className="relative z-20 container mx-auto max-w-4xl text-center px-4">
					<h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 bg-gradient-to-r from-green-500 via-green-200 to-orange-400 bg-clip-text text-transparent">
						Welcome to Irishette
					</h1>
					<p className="text-xl md:text-2xl text-popover mb-6 italic">
						Victorian charm. Modern comfort.
					</p>
					<p className="text-xl md:text-2xl text-popover mb-8 font-medium drop-shadow-md max-w-3xl mx-auto">
						Built in 1893, Irishette blends timeless character with a welcoming
						stay—just minutes from Tarleton State University.
					</p>
					<div className="flex flex-col sm:flex-row gap-4 justify-center">
						<Button
							variant="accent"
							size="lg"
							onClick={() => {
								const roomsSection = document.querySelector(
									'[data-rooms-section]',
								);
								if (roomsSection) {
									roomsSection.scrollIntoView({ behavior: 'smooth' });
								}
							}}
						>
							<BedDouble className="size-6" />
							View Our Rooms
						</Button>
						<Button variant="outline" size="lg" asChild>
							<Link to="/account">
								<Luggage className="size-6" />
								View Bookings
							</Link>
						</Button>
					</div>
				</div>
			</section>

			{/* Welcome Text */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<div className="grid md:grid-cols-2 gap-8 items-center">
						<Image
							src="https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/cb8e21a3-3a0c-4844-9eb8-37afbe8de80c.avif"
							alt="Irishette Exterior View"
							width={500}
							height={300}
							className="mx-auto rounded-lg"
						/>
						<div>
							<Bed className="size-16 text-accent mx-auto bg-primary rounded-lg p-3 mb-2" />
							<p className="text-foreground leading-relaxed text-justify">
								Built in 1893, Irishette preserves its Victorian charm while
								offering the comforts of a modern stay. Tucked away in the heart
								of Dublin, Texas, our two thoughtfully appointed rooms each
								feature their own unique character and private en-suite
								bathrooms, ensuring a relaxing retreat for every guest.
							</p>
						</div>
						<div>
							{' '}
							<MapPinHouse className="size-16 text-accent mx-auto bg-primary rounded-lg p-3 mb-2" />
							<p className="text-foreground leading-relaxed text-justify">
								While we don't serve breakfast, there are great dining options
								right here in town—just a short drive away. And with Tarleton
								State University only minutes from our door, we're an ideal
								choice for visiting family, attending events, or exploring the
								surrounding Cross Timbers region.
							</p>
						</div>
						<Image
							src="https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/67b358eb-1af2-4dae-9114-b74636c32119.avif"
							alt="Irishette Porch View"
							width={500}
							height={300}
							className="mx-auto rounded-lg"
						/>
					</div>
				</div>
			</section>

			{/* Rooms Section */}
			<section className="py-16 px-4 bg-muted/20" data-rooms-section>
				<div className="container mx-auto max-w-6xl">
					<h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
						Our Rooms
					</h2>

					<div className="grid md:grid-cols-2 gap-8">
						{/* Rose Room Card */}
						<Card className="overflow-hidden hover:shadow-lg transition-shadow">
							<CardHeader>
								<Image
									src="https://res.cloudinary.com/cobalt/image/upload/irishette/rose-room/7ec19df2-0b06-4d10-8777-3558acb41689.jpg"
									alt="Rose Room"
									width={400}
									height={300}
									className="mx-auto rounded-lg"
								/>
								<CardTitle className="text-2xl text-center text-rose-600">
									Rose Room
								</CardTitle>
								<CardDescription className="text-base">
									Leave your worries behind in this spacious and tranquil
									retreat.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-4 leading-relaxed">
									Private Entrance • Enclosed Sun Porch • Kitchenette • Queen
									Bed • Walk-in Shower • Work Space • Modern Amenities
								</p>
								<Button
									size="lg"
									asChild
									onClick={() =>
										window.scrollTo({ top: 0, behavior: 'smooth' })
									}
								>
									<Link to="/rooms/rose-room">View & Book Rose Room</Link>
								</Button>
							</CardContent>
						</Card>

						{/* Texas Room Card */}
						<Card className="overflow-hidden hover:shadow-lg transition-shadow">
							<CardHeader>
								<Image
									src="https://res.cloudinary.com/cobalt/image/upload/irishette/texas-room/9cbf035c-cdb9-49b2-8b27-b9f48b8f1cac.avif"
									alt="Texas Room"
									width={400}
									height={300}
									className="mx-auto rounded-lg"
								/>
								<CardTitle className="text-2xl text-center text-blue-600">
									Texas Room
								</CardTitle>
								<CardDescription className="text-base">
									Experience true Texas charm in this spacious and inviting
									retreat.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-4 leading-relaxed">
									Private Entrance • Kitchenette • King Bed • Antique Clawfoot
									Tub • Work Space • Texas-Themed Décor
								</p>
								<Button
									size="lg"
									asChild
									onClick={() =>
										window.scrollTo({ top: 0, behavior: 'smooth' })
									}
								>
									<Link to="/rooms/texas-room">View & Book Texas Room</Link>
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>
			</section>

			{/* Location Section */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<h2 className="text-3xl font-bold mb-6">Perfect Location</h2>
					<p className="text-lg text-muted-foreground">
						Located in the heart of Dublin, Texas, just minutes from Tarleton
						State University. Ideal for visiting family, attending events, or
						exploring the Cross Timbers region.
					</p>
				</div>
			</section>
		</div>
	);
}
