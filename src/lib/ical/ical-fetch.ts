// Fetching third-party iCal feeds safely: https only, no IP literals or
// localhost (also after redirects), a timeout and a response size cap. Shared
// by the import sync (ical-sync.ts) and the admin "Test URL" action.

import { readTextLimited } from '@/utils/read-limited';

/** Timeout for one feed fetch. */
export const FEED_TIMEOUT_MS = 10_000;
/** Largest feed body accepted (real feeds are well under 1 MB). */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** Thrown when a feed URL (or a redirect target) is not allowed. */
export class UnsafeFeedUrlError extends Error {
	override name = 'UnsafeFeedUrlError';
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * True for `https:` URLs with a DNS host name: no IP literals (v4 or v6), no
 * `localhost`, no credentials in the URL.
 */
export function isSafeFeedUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	if (url.username || url.password) return false;
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	if (!host || !host.includes('.')) return false;
	if (host === 'localhost' || host.endsWith('.localhost')) return false;
	if (IPV4.test(host) || host.startsWith('[')) return false;
	return true;
}

/**
 * GET a feed, following up to 5 redirects and checking each target with
 * `isSafeFeedUrl`. 304 and error statuses are returned as is.
 */
export async function fetchFeed(
	url: string,
	{
		headers,
		timeoutMs = FEED_TIMEOUT_MS,
	}: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Response> {
	const signal = AbortSignal.timeout(timeoutMs);
	let current = url;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!isSafeFeedUrl(current)) {
			throw new UnsafeFeedUrlError('Feed URLs must be public https URLs');
		}
		const response = await fetch(current, {
			headers,
			signal,
			redirect: 'manual',
		});
		const location = response.headers.get('location');
		if (response.status >= 300 && response.status < 400 && location) {
			await response.body?.cancel();
			current = new URL(location, current).toString();
			continue;
		}
		return response;
	}
	throw new UnsafeFeedUrlError('Too many redirects');
}

/** The feed body as text; throws BodyTooLargeError over MAX_FEED_BYTES. */
export function readFeedText(
	response: Response,
	maxBytes = MAX_FEED_BYTES,
): Promise<string> {
	return readTextLimited(response, maxBytes);
}
