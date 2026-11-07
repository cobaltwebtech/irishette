import { customAlphabet } from 'nanoid';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/** Primary key for every table (time-ordered UUIDv7, stored as TEXT). */
export const newId = (): string => uuidv7();

/**
 * Public, URL-safe identifier for rows shown in dynamic routes
 * (bookings, user, room). 16 chars of [0-9a-z].
 */
export const newPublicId = customAlphabet(
	'0123456789abcdefghijklmnopqrstuvwxyz',
	16,
);

const PUBLIC_ID_REGEX = /^[0-9a-z]{16}$/;

/** Zod schema for a `publicId` route param / procedure input. */
export const publicIdSchema = z.string().regex(PUBLIC_ID_REGEX, 'Invalid id');

/** Secret per-room iCal export token: 32 random bytes, base64url (43 chars). */
export function newIcalExportToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
