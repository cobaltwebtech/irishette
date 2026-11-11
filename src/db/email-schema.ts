import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { newId } from '@/utils/ids';

// One row per email already sent (or claimed). Cloudflare Email Service has no
// idempotency key, so a unique `key` makes webhook replays and cron retries
// send once; admin alerts also use it to throttle repeats (one email per alert
// per hour, repeats counted in suppressed_count). Written only through
// src/lib/email/email-dedupe.ts. Rows older than 7 days are purged by the
// daily cron.
export const sentEmails = sqliteTable(
	'sent_emails',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		// `<idempotency key>#<message index>` or `alert:<base>@<window start>`.
		key: text('key').notNull().unique(),
		kind: text('kind', { enum: ['message', 'alert'] }).notNull(),
		sentAt: integer('sent_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		// Alerts only: repeats suppressed in this window.
		suppressedCount: integer('suppressed_count').notNull().default(0),
	},
	(table) => [index('sent_emails_sent_at_idx').on(table.sentAt)],
);
