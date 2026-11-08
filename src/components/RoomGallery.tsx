import { Image } from '@unpic/react';
import { useState } from 'react';
import type { Swiper as SwiperType } from 'swiper';
import { FreeMode, Navigation, Thumbs } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

export interface RoomImage {
	src: string;
	alt: string;
	caption?: string;
}

export interface RoomGalleryProps {
	/** Array of images to display in the gallery */
	images: RoomImage[];
	/** Room name for accessibility and alt text fallbacks */
	roomName: string;
	/** Additional CSS classes for the gallery container */
	className?: string;
	/** Height for the main gallery images */
	mainImageHeight?: number;
	/** Height for the thumbnail images */
	thumbImageHeight?: number;
	/** Number of thumbnails to show per view */
	thumbsPerView?: number;
	/** Space between slides in pixels */
	spaceBetween?: number;
}

/**
 * RoomGallery - A reusable photo gallery component for room pages
 *
 * Features:
 * - Main image carousel with navigation
 * - Thumbnail navigation below
 * - Image optimization via Unpic (auto-detects Cloudinary URLs)
 * - Responsive design
 * - Accessibility features
 */
export function RoomGallery({
	images,
	roomName,
	className = '',
	mainImageHeight = 500,
	thumbImageHeight = 80,
	thumbsPerView = 4,
	spaceBetween = 10,
}: RoomGalleryProps) {
	const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

	if (!images || images.length === 0) {
		return (
			<div
				className={`flex items-center justify-center rounded-lg bg-muted ${className}`}
				style={{ height: mainImageHeight }}
			>
				<p className="text-muted-foreground">No images available</p>
			</div>
		);
	}

	return (
		<div className={`room-gallery ${className}`}>
			{/* Main Gallery */}
			<Swiper
				style={
					{
						'--swiper-navigation-color': '#fff',
						'--swiper-pagination-color': '#fff',
						height: mainImageHeight,
					} as React.CSSProperties
				}
				spaceBetween={spaceBetween}
				navigation={true}
				thumbs={{
					swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
				}}
				modules={[FreeMode, Navigation, Thumbs]}
				className="main-gallery mb-4 overflow-hidden rounded-lg"
			>
				{images.map((image, index) => (
					<SwiperSlide key={`main-${image.src}`}>
						<div className="relative h-full w-full">
							{/* @ts-ignore - fullWidth is valid but not in current type definitions */}
							<Image
								src={image.src}
								alt={image.alt || `${roomName} - Image ${index + 1}`}
								width={800}
								height={mainImageHeight}
								priority={index === 0} // Prioritize loading the first image
								className="h-full w-full object-cover"
								layout="fullWidth"
							/>
							{image.caption && (
								<div className="absolute right-0 bottom-0 left-0 bg-black/60 p-3 text-white">
									<p className="text-sm">{image.caption}</p>
								</div>
							)}
						</div>
					</SwiperSlide>
				))}
			</Swiper>

			{/* Thumbnail Gallery */}
			{images.length > 1 && (
				<Swiper
					onSwiper={setThumbsSwiper}
					spaceBetween={spaceBetween}
					slidesPerView={thumbsPerView}
					freeMode={true}
					watchSlidesProgress={true}
					modules={[FreeMode, Navigation, Thumbs]}
					className="thumb-gallery"
					style={{ height: thumbImageHeight }}
					breakpoints={{
						// Responsive thumbnails
						320: {
							slidesPerView: 2,
						},
						480: {
							slidesPerView: 3,
						},
						640: {
							slidesPerView: thumbsPerView,
						},
						768: {
							slidesPerView: Math.min(thumbsPerView + 1, images.length),
						},
						1024: {
							slidesPerView: Math.min(thumbsPerView + 2, images.length),
						},
					}}
				>
					{images.map((image, index) => (
						<SwiperSlide key={`thumb-${image.src}`} className="cursor-pointer">
							<div className="relative h-full w-full overflow-hidden rounded transition-opacity hover:opacity-80">
								{/* @ts-ignore - fullWidth is valid but not in current type definitions */}
								<Image
									src={image.src}
									alt={`${roomName} thumbnail ${index + 1}`}
									width={100}
									height={thumbImageHeight}
									className="h-full w-full object-cover"
									layout="fullWidth"
								/>
							</div>
						</SwiperSlide>
					))}
				</Swiper>
			)}
		</div>
	);
}
