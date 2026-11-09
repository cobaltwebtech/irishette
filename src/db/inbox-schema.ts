import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { newId, newPublicId } from '../lib/ids';
import {
	type InboxDetails,
	inboxKinds,
	inboxSources,
	inboxStatuses,
} from '../lib/inbox';
import { user } from './auth-schema';
import { bookings, paymentDisputes } from './booking-schema';

// Internal admin notifications (Stripe and system events). One table, one
// indexed list query. Items are kept until an admin deletes them.
// Written only through createInboxItem (src/lib/inbox-service.ts); see
// docs/ADMIN_INBOX.md.
export const adminInboxItems = sqliteTable(
	'admin_inbox_items',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		// Public id used in URLs (/admin/inbox/$publicId).
		publicId: text('public_id').notNull().unique().$defaultFn(newPublicId),
		source: text('source', { enum: inboxSources }).notNull(),
		kind: text('kind', { enum: inboxKinds }).notNull(),
		// Short text for the list. No guest message bodies, no card data.
		title: text('title').notNull(),
		summary: text('summary').notNull(),
		// Kind-specific fields (src/lib/inbox.ts InboxDetailsByKind).
		details: text('details', { mode: 'json' }).$type<InboxDetails>().notNull(),
		status: text('status', { enum: inboxStatuses }).notNull().default('new'),
		readAt: integer('read_at', { mode: 'timestamp' }),
		archivedAt: integer('archived_at', { mode: 'timestamp' }),
		bookingId: text('booking_id').references(() => bookings.id, {
			onDelete: 'set null',
		}),
		userId: text('user_id').references(() => user.id, {
			onDelete: 'set null',
		}),
		// The dispute a payment_dispute item is about. Deleting the item keeps
		// the dispute (a financial record).
		paymentDisputeId: text('payment_dispute_id').references(
			() => paymentDisputes.id,
			{ onDelete: 'set null' },
		),
		// Makes creation idempotent across webhook replays and cron retries
		// (e.g. refund_failed:<refundId>). Null: always a new item.
		dedupeKey: text('dedupe_key').unique(),
		// How many times the event was reported (1 + repeats of the dedupe key).
		occurrences: integer('occurrences').notNull().default(1),
		// When the item was last put in front of admins (created or resurfaced
		// as new). The list is ordered by (surfaced_at DESC, public_id DESC);
		// public_id is the keyset tiebreak, so cursors never carry the PK.
		surfacedAt: integer('surfaced_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		// SQLite walks these backwards for the DESC list order.
		index('admin_inbox_status_surfaced_idx').on(
			table.status,
			table.surfacedAt,
			table.publicId,
		),
		index('admin_inbox_source_status_surfaced_idx').on(
			table.source,
			table.status,
			table.surfacedAt,
		),
		index('admin_inbox_booking_idx').on(table.bookingId, table.surfacedAt),
		index('admin_inbox_user_idx').on(table.userId, table.surfacedAt),
	],
);
