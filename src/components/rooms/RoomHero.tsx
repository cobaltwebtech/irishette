import { Icon } from '@iconify/react';

import { scrollToSection } from '@/components/rooms/scroll-to-section';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/twMerge';

interface RoomHeroProps {
	/** Full-width background image URL. */
	imageUrl: string;
	/** Iconify icon above the title, and its colour class. */
	icon: string;
	iconClassName: string;
	title: string;
	/** Gradient and font classes for the title. */
	titleClassName: string;
	tagline: string;
}

/** Room page hero: background image, title and the two scroll buttons. */
export function RoomHero({
	imageUrl,
	icon,
	iconClassName,
	title,
	titleClassName,
	tagline,
}: RoomHeroProps) {
	return (
		<section className="relative flex h-[50vh] min-h-[500px] items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
			{/* Background Image */}
			<div
				className="absolute inset-0 bg-cover bg-center bg-no-repeat"
				style={{ backgroundImage: `url('${imageUrl}')` }}
			/>

			{/* Overlay for better text readability */}
			<div className="absolute inset-0 bg-black/60" />

			{/* Content */}
			<div className="relative z-10 container mx-auto max-w-4xl px-4 text-center">
				<div className={cn('mb-4 flex justify-center', iconClassName)}>
					<Icon icon={icon} className="size-24" />
				</div>
				<h1
					className={cn(
						'mb-6 bg-clip-text text-4xl font-black text-transparent md:text-6xl lg:text-7xl',
						titleClassName,
					)}
				>
					{title}
				</h1>
				<p className="mx-auto mb-8 max-w-3xl text-xl font-medium text-popover italic drop-shadow-md md:text-2xl">
					{tagline}
				</p>
				<div className="flex flex-col justify-center gap-4 sm:flex-row">
					<Button
						variant="accent"
						size="lg"
						onClick={() => scrollToSection('calendar')}
					>
						<Icon icon="tabler:calendar-check" className="size-6" />
						Book {title}
					</Button>
					<Button
						variant="outline"
						size="lg"
						className="text-background"
						onClick={() => scrollToSection('gallery')}
					>
						<Icon icon="tabler:photo-down" className="size-6" />
						View Room Photos
					</Button>
				</div>
			</div>
		</section>
	);
}
