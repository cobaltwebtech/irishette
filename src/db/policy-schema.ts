import { relations } from 'drizzle-orm';
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { newId } from '@/utils/ids';

// Cancellation & refund policy (docs/cancellation-refund-policy.md), stored so
// an admin can change it. Policies are versioned: changing the policy creates
// a new row and deactivates the old one, and each booking keeps the id of the
// policy it was booked under. A booking with no policy id was booked under the
// built-in default (src/lib/booking/cancellation-policy.ts DEFAULT_CANCELLATION_POLICY).
export const cancellationPolicies = sqliteTable(
	'cancellation_policies',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		name: text('name').notNull(),
		isActive: integer('is_active', { mode: 'boolean' })
			.notNull()
			.default(false),
		createdBy: text('created_by'), // admin user id
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [index('cancellation_policies_active_idx').on(table.isActive)],
);

// Refund tiers, counted back from check-in at 4:00 PM CT on the local clock
// (src/lib/booking/cancellation-policy.ts). A cancellation at or before a tier's
// cutoff gets that tier's refund (the most notice first).
export const cancellationPolicyTiers = sqliteTable(
	'cancellation_policy_tiers',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		policyId: text('policy_id')
			.notNull()
			.references(() => cancellationPolicies.id, { onDelete: 'cascade' }),
		minHoursBefore: integer('min_hours_before').notNull(),
		refundPercent: integer('refund_percent').notNull(), // 0-100
	},
	(table) => [
		uniqueIndex('cancellation_policy_tiers_policy_hours_unique').on(
			table.policyId,
			table.minHoursBefore,
		),
	],
);

export const cancellationPoliciesRelations = relations(
	cancellationPolicies,
	({ many }) => ({ tiers: many(cancellationPolicyTiers) }),
);

export const cancellationPolicyTiersRelations = relations(
	cancellationPolicyTiers,
	({ one }) => ({
		policy: one(cancellationPolicies, {
			fields: [cancellationPolicyTiers.policyId],
			references: [cancellationPolicies.id],
		}),
	}),
);
