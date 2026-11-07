import { customAlphabet } from 'nanoid';
import { v7 as uuidv7 } from 'uuid';

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

export const PUBLIC_ID_REGEX = /^[0-9a-z]{16}$/;
