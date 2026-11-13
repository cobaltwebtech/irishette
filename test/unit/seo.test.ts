import { describe, expect, it } from 'vite-plus/test';

import { SITE_URL } from '@/lib/site';
import { absoluteUrl, canonicalLink, seo, shareImage } from '@/utils/seo';

describe('seo', () => {
	it('has no leftover template twitter handles', () => {
		const names = seo({ title: 'T', description: 'D' }).map((t) =>
			'name' in t ? t.name : undefined,
		);
		expect(names).not.toContain('twitter:creator');
		expect(names).not.toContain('twitter:site');
	});

	it('drops tags without a value so they never hide a parent tag', () => {
		const tags = seo({ title: 'T' });
		expect(tags.some((t) => 'name' in t && t.name === 'description')).toBe(
			false,
		);
		expect(tags.some((t) => 'name' in t && t.name === 'keywords')).toBe(false);
	});

	it('adds og:url, og:image and the large card only when given', () => {
		const plain = seo({ title: 'T', description: 'D' });
		expect(plain.some((t) => 'property' in t && t.property === 'og:url')).toBe(
			false,
		);
		const full = seo({
			title: 'T',
			description: 'D',
			path: '/contact',
			image: shareImage('rose-room', 'abc'),
		});
		expect(full).toContainEqual({
			property: 'og:url',
			content: `${SITE_URL}/contact`,
		});
		expect(full).toContainEqual({
			property: 'og:image',
			content: expect.stringContaining('/irishette/rose-room/abc.jpg'),
		});
		expect(full).toContainEqual({
			name: 'twitter:card',
			content: 'summary_large_image',
		});
	});

	it('uses og:* as property tags, not name tags', () => {
		const tags = seo({ title: 'T', description: 'D' });
		expect(tags.some((t) => 'name' in t && t.name?.startsWith('og:'))).toBe(
			false,
		);
		expect(tags).toContainEqual({ property: 'og:title', content: 'T' });
	});

	it('builds absolute, www-host canonical URLs', () => {
		expect(absoluteUrl('/')).toBe('https://www.irishette.com/');
		expect(canonicalLink('/rooms/rose-room')).toEqual({
			rel: 'canonical',
			href: 'https://www.irishette.com/rooms/rose-room',
		});
	});
});
