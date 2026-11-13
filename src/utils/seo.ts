import { SITE_NAME, SITE_URL } from '@/lib/site';

const CLOUDINARY_UPLOAD = 'https://res.cloudinary.com/cobalt/image/upload';

/** Absolute URL on the production site for a path such as `/rooms/rose-room`. */
export const absoluteUrl = (path: string) => `${SITE_URL}${path}`;

/**
 * A 1200x630 share image (the Open Graph / Twitter large-card size) cropped
 * from one of a room's Cloudinary images (`irishette/<folder>/<id>`). Always a
 * JPEG: some link-preview crawlers do not read AVIF/WebP.
 */
export const shareImage = (folder: string, imageId: string) =>
	`${CLOUDINARY_UPLOAD}/c_fill,w_1200,h_630,q_auto,f_jpg/irishette/${folder}/${imageId}.jpg`;

/** The site-wide default share image (a Rose Room photo). */
export const DEFAULT_SHARE_IMAGE = shareImage(
	'rose-room',
	'7ec19df2-0b06-4d10-8777-3558acb41689',
);

/** `<link rel="canonical">` for a public page: production host, no query. */
export const canonicalLink = (path: string) => ({
	rel: 'canonical',
	href: absoluteUrl(path),
});

export const seo = ({
	title,
	description,
	keywords,
	image,
	path,
}: {
	title: string;
	description?: string;
	image?: string;
	keywords?: string;
	/** Site path of the page (`/contact`); adds `og:url`. Pair it with `canonicalLink`. */
	path?: string;
}) => {
	const tags = [
		{ title },
		{ name: 'description', content: description },
		{ name: 'keywords', content: keywords },
		{ name: 'twitter:title', content: title },
		{ name: 'twitter:description', content: description },
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: SITE_NAME },
		{ property: 'og:title', content: title },
		{ property: 'og:description', content: description },
		...(path ? [{ property: 'og:url', content: absoluteUrl(path) }] : []),
		...(image
			? [
					{ name: 'twitter:image', content: image },
					{ name: 'twitter:card', content: 'summary_large_image' },
					{ property: 'og:image', content: image },
				]
			: []),
	];

	// Drop tags without a value: a leaf route's empty tag would otherwise hide
	// the root route's tag of the same name (the router keeps the leaf's).
	return tags.filter((tag) => !('content' in tag) || tag.content !== undefined);
};
