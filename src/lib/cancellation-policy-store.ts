import { desc, eq } from 'drizzle-orm';

import type { Database } from '@/db/drizzle-init';
import {
	cancellationPolicies,
	cancellationPolicyTiers,
} from '@/db/schema-export';

import {
	type CancellationPolicy,
	type CancellationPolicyInput,
	DEFAULT_CANCELLATION_POLICY,
	sortTiers,
} from './cancellation-policy';
import { newId } from './ids';

async function loadPolicy(
	db: Database,
	id: string,
): Promise<CancellationPolicy | null> {
	const [row] = await db
		.select()
		.from(cancellationPolicies)
		.where(eq(cancellationPolicies.id, id));
	if (!row) return null;
	const tiers = await db
		.select({
			minHoursBefore: cancellationPolicyTiers.minHoursBefore,
			refundPercent: cancellationPolicyTiers.refundPercent,
		})
		.from(cancellationPolicyTiers)
		.where(eq(cancellationPolicyTiers.policyId, id));
	return {
		id: row.id,
		name: row.name,
		tiers: sortTiers(tiers),
	};
}

/** The policy new bookings get: the active saved one, else the default. */
export async function getActiveCancellationPolicy(
	db: Database,
): Promise<CancellationPolicy> {
	const [active] = await db
		.select({ id: cancellationPolicies.id })
		.from(cancellationPolicies)
		.where(eq(cancellationPolicies.isActive, true))
		.orderBy(desc(cancellationPolicies.createdAt))
		.limit(1);
	return (
		(active && (await loadPolicy(db, active.id))) ?? DEFAULT_CANCELLATION_POLICY
	);
}

/** The policy a booking was made under. */
export async function getBookingCancellationPolicy(
	db: Database,
	policyId: string | null,
): Promise<CancellationPolicy> {
	const saved = policyId ? await loadPolicy(db, policyId) : null;
	return saved ?? DEFAULT_CANCELLATION_POLICY;
}

/**
 * Saves a new policy version and makes it the active one. Existing bookings
 * keep the version they were booked under.
 */
export async function saveCancellationPolicy(
	db: Database,
	input: CancellationPolicyInput,
	adminUserId: string,
): Promise<CancellationPolicy> {
	const id = newId();
	await db.batch([
		db
			.update(cancellationPolicies)
			.set({ isActive: false })
			.where(eq(cancellationPolicies.isActive, true)),
		db.insert(cancellationPolicies).values({
			id,
			name: input.name,
			isActive: true,
			createdBy: adminUserId,
		}),
		db.insert(cancellationPolicyTiers).values(
			input.tiers.map((t) => ({
				policyId: id,
				minHoursBefore: t.minHoursBefore,
				refundPercent: t.refundPercent,
			})),
		),
	]);
	const saved = await loadPolicy(db, id);
	if (!saved) throw new Error('Saved policy not found');
	return saved;
}

/** Past versions, newest first (admin history). */
export async function listCancellationPolicies(db: Database) {
	return db
		.select()
		.from(cancellationPolicies)
		.orderBy(desc(cancellationPolicies.createdAt));
}
