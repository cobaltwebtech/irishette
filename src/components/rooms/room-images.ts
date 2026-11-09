import type { RoomImage } from '@/components/RoomGallery';

const CLOUDINARY_UPLOAD = 'https://res.cloudinary.com/cobalt/image/upload';

/** Gallery images for a room, from its Cloudinary folder (`irishette/<slug>`). */
export function roomGalleryImages(
	slug: string,
	roomName: string,
	imageIds: string[],
): RoomImage[] {
	return imageIds.map((id, index) => ({
		src: `${CLOUDINARY_UPLOAD}/irishette/${slug}/${id}.jpg`,
		alt: `${roomName} - Image ${index + 1}`,
	}));
}

/** A 1920x1080 hero crop of one of the room's images. */
export function roomHeroImage(slug: string, imageId: string) {
	return `${CLOUDINARY_UPLOAD}/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/${slug}/${imageId}.jpg`;
}
