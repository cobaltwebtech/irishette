import { z } from 'zod';

import { publicIdSchema } from '@/utils/ids';

import { inboxKinds, inboxSources } from './inbox';

// Inputs of the admin inbox procedures (src/integrations/trpc/inbox.ts) and
// the inbox page's search params.

/** Which items a list shows. 'inbox' = new + read (not archived). */
export const inboxViews = ['inbox', 'new', 'read', 'archived'] as const;
export type InboxView = (typeof inboxViews)[number];

export const INBOX_PAGE_SIZES = [10, 25, 50, 100] as const;

const CURSOR_REGEX = /^\d{1,12}\.[0-9a-z]{16}$/;

/**
 * Keyset cursor: "<surfaced_at seconds>.<publicId>" of the row the next (or
 * previous) page starts after.
 */
export const inboxCursorSchema = z
	.string()
	.regex(CURSOR_REGEX, 'Invalid cursor');

export function encodeInboxCursor(row: { surfacedAt: Date; publicId: string }) {
	return `${Math.floor(row.surfacedAt.getTime() / 1000)}.${row.publicId}`;
}

export function decodeInboxCursor(cursor: string) {
	const [seconds, publicId] = cursor.split('.');
	return { surfacedAt: Number(seconds), publicId };
}

/** Filters shared by the list and its count. */
export const inboxFiltersSchema = z.object({
	view: z.enum(inboxViews).default('inbox'),
	source: z.enum(inboxSources).optional(),
	kind: z.enum(inboxKinds).optional(),
	/** Bounded LIKE on title and summary. */
	search: z.string().trim().max(100).optional(),
});

export const inboxListSchema = inboxFiltersSchema.extend({
	pageSize: z.number().int().min(1).max(100).default(25),
	cursor: inboxCursorSchema.optional(),
	/** 'next': older than the cursor; 'prev': newer than it. */
	direction: z.enum(['next', 'prev']).default('next'),
});

const publicIdsSchema = z.array(publicIdSchema).min(1).max(100);

export const inboxSetStatusSchema = z.object({
	publicIds: publicIdsSchema,
	/** 'unarchived' moves archived items back to the inbox as read. */
	status: z.enum(['new', 'read', 'archived', 'unarchived']),
});

export const inboxDeleteSchema = z.object({ publicIds: publicIdsSchema });

/** Search params of /admin/inbox (invalid values fall back to defaults). */
export const inboxSearchSchema = z.object({
	view: z.enum(inboxViews).optional().catch(undefined),
	source: z.enum(inboxSources).optional().catch(undefined),
	kind: z.enum(inboxKinds).optional().catch(undefined),
	q: z.string().trim().max(100).optional().catch(undefined),
	cursor: inboxCursorSchema.optional().catch(undefined),
	dir: z.enum(['next', 'prev']).optional().catch(undefined),
	pageSize: z.literal(INBOX_PAGE_SIZES).optional().catch(undefined),
});
