// Cancellation & refund policy (docs/cancellation-refund-policy.md). Pure:
// the policy data, its validation, and the refund quote for a cancellation.
// Policies live in the database (src/db/policy-schema.ts); bookings made
// before any policy was saved use DEFAULT_CANCELLATION_POLICY.

import { z } from 'zod';

import type { IsoDate } from './date-range';
import { roundCents } from './pricing';
import { PROPERTY_TIMEZONE, zonedTimeToUtc } from './timezone';

export interface CancellationTier {
	/** Applies when cancelling at least this many hours before check-in. */
	minHoursBefore: number;
	/** Percent of the amount paid that is refunded (0-100). */
	refundPercent: number;
}

export interface CancellationPolicy {
	/** Database id, or null for the built-in default. */
	id: string | null;
	name: string;
	/** Local check-in time ("HH:MM") the windows count back from. */
	checkInTime: string;
	timezone: string;
	tiers: CancellationTier[];
}

/** The policy in docs/cancellation-refund-policy.md (Oct 16, 2025). */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
	id: null,
	name: 'Standard policy',
	checkInTime: '16:00',
	timezone: PROPERTY_TIMEZONE,
	tiers: [
		{ minHoursBefore: 72, refundPercent: 100 },
		{ minHoursBefore: 24, refundPercent: 50 },
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
		checkInTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM'),
		timezone: z.string().refine((tz) => {
			try {
				new Intl.DateTimeFormat('en-US', { timeZone: tz });
				return true;
			} catch {
				return false;
			}
		}, 'Unknown timezone'),
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

export interface CancellationQuote {
	/** When check-in starts (property time), as an instant. */
	checkInAt: Date;
	hoursBeforeCheckIn: number;
	/** False once check-in time has passed (guests can no longer cancel). */
	canCancel: boolean;
	tier: CancellationTier | null;
	refundPercent: number;
	refundAmount: number;
}

/**
 * Refund for cancelling a stay at `now`. `amountPaid` is what the guest paid
 * (0 for an unpaid hold).
 */
export function quoteCancellation({
	policy,
	checkInDate,
	amountPaid,
	now = new Date(),
}: {
	policy: CancellationPolicy;
	checkInDate: IsoDate;
	amountPaid: number;
	now?: Date;
}): CancellationQuote {
	const checkInAt = zonedTimeToUtc(
		checkInDate,
		policy.checkInTime,
		policy.timezone,
	);
	const hoursBeforeCheckIn = (checkInAt.getTime() - now.getTime()) / 3_600_000;
	const canCancel = hoursBeforeCheckIn > 0;
	const tier = canCancel
		? (sortTiers(policy.tiers).find(
				(t) => hoursBeforeCheckIn >= t.minHoursBefore,
			) ?? null)
		: null;
	const refundPercent = tier?.refundPercent ?? 0;
	return {
		checkInAt,
		hoursBeforeCheckIn,
		canCancel,
		tier,
		refundPercent,
		refundAmount: roundCents((Math.max(0, amountPaid) * refundPercent) / 100),
	};
}
