// Cancellation & refund policy (docs/cancellation-refund-policy.md). Pure:
// the policy data, its validation, and the refund quote for a cancellation.
// Policies live in the database (src/db/policy-schema.ts); bookings made
// before any policy was saved use DEFAULT_CANCELLATION_POLICY.

import { z } from 'zod';

import { CHECK_IN_TIME } from '@/lib/site';
import type { IsoDate } from '@/utils/date-range';

import { roundCents } from './pricing';
import { checkInAt as checkInInstant, localCutoff } from './stay-times';

// Windows count back from check-in at 4:00 PM CT (CHECK_IN_TIME, a fixed
// constant since plan 02, 3.9) on the local clock: a tier's cutoff is
// `minHoursBefore` hours before 4:00 PM CT on the check-in date, with whole
// days counted as calendar days (so "72 hours" is 4:00 PM CT three days
// before, across DST too). At exactly a cutoff the higher refund applies.

export interface CancellationTier {
	/** Applies when cancelling at least this many hours before check-in. */
	minHoursBefore: number;
	/** Percent of the booking total that is refunded (0-100). */
	refundPercent: number;
}

export interface CancellationPolicy {
	/** Database id, or null for the built-in default. */
	id: string | null;
	name: string;
	tiers: CancellationTier[];
}

/**
 * The policy in docs/cancellation-refund-policy.md (Nov 13, 2026): full
 * refund 7 days or more before check-in, 75% from 3 days, nothing after.
 * Used until an admin saves a policy (e.g. in a fresh production database).
 */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
	id: null,
	name: 'Standard policy',
	tiers: [
		{ minHoursBefore: 168, refundPercent: 100 },
		{ minHoursBefore: 72, refundPercent: 75 },
		{ minHoursBefore: 0, refundPercent: 0 },
	],
};

const cancellationTierSchema = z.object({
	minHoursBefore: z
		.number()
		.int()
		.min(0)
		.max(24 * 365),
	refundPercent: z.number().int().min(0).max(100),
});

/** Admin input for a new policy version. */
export const cancellationPolicyInputSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		tiers: z.array(cancellationTierSchema).min(1).max(10),
	})
	.superRefine((policy, ctx) => {
		const hours = policy.tiers.map((t) => t.minHoursBefore);
		if (new Set(hours).size !== hours.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['tiers'],
				message: 'Each tier needs a different number of hours',
			});
		}
		if (!hours.includes(0)) {
			ctx.addIssue({
				code: 'custom',
				path: ['tiers'],
				message: 'Add a tier for 0 hours (cancellations closest to check-in)',
			});
		}
		const sorted = sortTiers(policy.tiers);
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].refundPercent > sorted[i - 1].refundPercent) {
				ctx.addIssue({
					code: 'custom',
					path: ['tiers'],
					message: 'Later cancellations cannot get a larger refund',
				});
				break;
			}
		}
	});

export type CancellationPolicyInput = z.infer<
	typeof cancellationPolicyInputSchema
>;

/** Tiers from the most notice to the least. */
export function sortTiers(tiers: CancellationTier[]): CancellationTier[] {
	return [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
}

/** "168" -> "7 days", "36" -> "36 hours" (whole days when they divide). */
function formatNotice(hours: number): string {
	const unit = hours % 24 === 0 ? 'day' : 'hour';
	const count = unit === 'day' ? hours / 24 : hours;
	return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** A tier worded as a window before check-in, e.g. for the policy page. */
export interface TierWindow {
	/** "At least 7 days before check-in" */
	label: string;
	refundPercent: number;
}

/**
 * Each tier as a window (most notice first), written so that a cancellation
 * exactly at a cutoff falls in the higher-refund window, like the quote.
 */
export function describeTiers(tiers: CancellationTier[]): TierWindow[] {
	const sorted = sortTiers(tiers);
	return sorted.map((tier, i) => {
		const longer = i > 0 ? sorted[i - 1].minHoursBefore : null;
		let label: string;
		if (longer === null) {
			label =
				tier.minHoursBefore === 0
					? 'Any time before check-in'
					: `At least ${formatNotice(tier.minHoursBefore)} before check-in`;
		} else if (tier.minHoursBefore === 0) {
			label = `Less than ${formatNotice(longer)} before check-in`;
		} else {
			label = `${formatNotice(tier.minHoursBefore)} to less than ${formatNotice(longer)} before check-in`;
		}
		return { label, refundPercent: tier.refundPercent };
	});
}

/** A tier with its cutoff instant: it applies while `now <= until`. */
export interface RefundCutoff {
	minHoursBefore: number;
	refundPercent: number;
	/** UTC instant (local wall-clock cutoff converted with the CT offset). */
	until: Date;
}

/** Each tier's cutoff for a stay, most notice first. */
export function refundCutoffs(
	policy: Pick<CancellationPolicy, 'tiers'>,
	checkInDate: IsoDate,
): RefundCutoff[] {
	return sortTiers(policy.tiers).map((t) => ({
		...t,
		until: localCutoff(checkInDate, CHECK_IN_TIME, t.minHoursBefore),
	}));
}

export interface CancellationQuote {
	/** Check-in (4:00 PM CT on the check-in date), as an instant. */
	checkInAt: Date;
	/** False from check-in on (guests can no longer cancel online). */
	canCancel: boolean;
	/** The tier that applies now (null once check-in has passed). */
	tier: RefundCutoff | null;
	refundPercent: number;
	refundAmount: number;
	refundCutoffs: RefundCutoff[];
}

/**
 * Refund for cancelling a stay at `now`: the policy percent of the booking
 * total (`amountPaid`, including taxes and fees), capped at what is still
 * paid (`amountPaid - alreadyRefunded`, e.g. after a partial refund in
 * Stripe). `amountPaid` is 0 for an unpaid hold. `checkInAt` defaults to
 * 4:00 PM CT on the check-in date (bookings store it as check_in_at).
 */
export function quoteCancellation({
	policy,
	checkInDate,
	checkInAt = checkInInstant(checkInDate),
	amountPaid,
	alreadyRefunded = 0,
	now = new Date(),
}: {
	policy: Pick<CancellationPolicy, 'tiers'>;
	checkInDate: IsoDate;
	checkInAt?: Date;
	amountPaid: number;
	alreadyRefunded?: number;
	now?: Date;
}): CancellationQuote {
	const cutoffs = refundCutoffs(policy, checkInDate);
	const canCancel = now < checkInAt;
	const tier = canCancel ? (cutoffs.find((c) => now <= c.until) ?? null) : null;
	const refundPercent = tier?.refundPercent ?? 0;
	const paid = Math.max(0, amountPaid);
	const remaining = Math.max(0, roundCents(paid - alreadyRefunded));
	return {
		checkInAt,
		canCancel,
		tier,
		refundPercent,
		refundAmount: Math.min(remaining, roundCents((paid * refundPercent) / 100)),
		refundCutoffs: cutoffs,
	};
}
