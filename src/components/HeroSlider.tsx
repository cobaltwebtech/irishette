import { Image } from '@unpic/react';
import { Autoplay, EffectFade } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

export interface SlideImage {
	src: string;
	alt: string;
}

export interface HeroBackgroundSlideshowProps {
	/** Array of images to display in the slideshow */
	images: SlideImage[];
	/** Duration between slides in milliseconds */
	autoplayDelay?: number;
	/** Additional CSS classes for the slideshow container */
	className?: string;
}

/**
 * HeroSlider - An automatic background slideshow component with fade effect
 *
 * Features:
 * - Automatic slideshow with smooth fade transitions
 * - Optimized for background use with full coverage
 * - Configurable autoplay timing
 * - Smooth fade transitions between images
 */
export function HeroSlider({
	images,
	autoplayDelay = 3000,
	className = '',
}: HeroBackgroundSlideshowProps) {
	if (!images || images.length === 0) {
		return (
			<div className={`absolute inset-0 bg-muted ${className}`}>
				<div className="w-full h-full flex items-center justify-center">
					<p className="text-muted-foreground">No images available</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`absolute inset-0 ${className}`}>
			<Swiper
				modules={[Autoplay, EffectFade]}
				effect="fade"
				fadeEffect={{
					crossFade: true,
				}}
				autoplay={{
					delay: autoplayDelay,
					disableOnInteraction: false,
					pauseOnMouseEnter: false,
				}}
				loop={true}
				allowTouchMove={false}
				className="w-full h-full z-0"
			>
				{images.map((image, index) => (
					<SwiperSlide key={`slide-${image.src}-${index}`}>
						<Image
							src={image.src}
							alt={image.alt}
							width={1920}
							height={1080}
							priority={index === 0} // Prioritize loading the first image
						/>
					</SwiperSlide>
				))}
			</Swiper>
		</div>
	);
}
