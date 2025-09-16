import { createFileRoute, Link } from '@tanstack/react-router';
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
	return (
		<div className="min-h-screen bg-background">
			{/* Hero Section */}
			<section className="relative bg-gradient-to-b from-primary/10 to-background py-20 px-4">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-6xl font-bold text-foreground mb-4">
						Welcome to Irishette
					</h1>
					<p className="text-xl md:text-2xl text-muted-foreground mb-6 italic">
						Victorian charm. Modern comfort.
					</p>
					<p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
						Built in 1893, Irishette blends timeless character with a welcoming
						stay—just minutes from Tarleton State University.
					</p>
				</div>
			</section>

			{/* Welcome Text */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-4xl">
					<div className="prose prose-lg mx-auto text-center">
						<p className="text-foreground/90 leading-relaxed">
							Built in 1893, Irishette preserves its Victorian charm while
							offering the comforts of a modern stay. Tucked away in the heart
							of Dublin, Texas, our two thoughtfully appointed rooms each
							feature their own unique character and private en-suite bathrooms,
							ensuring a relaxing retreat for every guest.
						</p>
						<br />
						<p className="text-foreground/90 leading-relaxed">
							While we don't serve breakfast, there are great dining options
							right here in town—just a short drive away. And with Tarleton
							State University only minutes from our door, we're an ideal choice
							for visiting family, attending events, or exploring the
							surrounding Cross Timbers region.
						</p>
					</div>
				</div>
			</section>

			{/* Rooms Section */}
			<section className="py-16 px-4 bg-muted/20">
				<div className="container mx-auto max-w-6xl">
					<h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
						Our Rooms
					</h2>

					<div className="grid md:grid-cols-2 gap-8">
						{/* Rose Room Card */}
						<Card className="overflow-hidden hover:shadow-lg transition-shadow">
							<CardHeader>
								<CardTitle className="text-2xl">Rose Room</CardTitle>
								<CardDescription className="text-base">
									Leave your worries behind in this spacious and tranquil
									retreat.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-4 leading-relaxed">
									Private entrance • Enclosed sun porch • Kitchenette • Queen
									bed • Walk-in shower • Work space • Modern amenities
								</p>
								<Link
									to="/rose-room"
									className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									Learn More
								</Link>
							</CardContent>
						</Card>

						{/* Texas Room Card */}
						<Card className="overflow-hidden hover:shadow-lg transition-shadow">
							<CardHeader>
								<CardTitle className="text-2xl">Texas Room</CardTitle>
								<CardDescription className="text-base">
									Experience true Texas charm in this spacious and inviting
									retreat.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-4 leading-relaxed">
									Private entrance • Kitchenette • King bed • Antique clawfoot
									tub • Work space • Texas-themed décor
								</p>
								<Link
									to="/texas-room"
									className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									Learn More
								</Link>
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
