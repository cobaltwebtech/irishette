import { cancellationPolicyInputSchema } from '@/lib/cancellation-policy';
import {
	getActiveCancellationPolicy,
	listCancellationPolicies,
	saveCancellationPolicy,
} from '@/lib/cancellation-policy-store';

import { adminProcedure, createTRPCRouter, publicProcedure } from './init';

export const policiesRouter = createTRPCRouter({
	/** The cancellation policy new bookings get (public: shown at checkout). */
	getCancellationPolicy: publicProcedure.query(async ({ ctx }) => {
		const policy = await getActiveCancellationPolicy(ctx.db);
		return {
			name: policy.name,
			tiers: policy.tiers,
			isDefault: policy.id === null,
		};
	}),

	/**
	 * Saves a new policy version for future bookings. Existing bookings keep
	 * the version they were booked under.
	 */
	saveCancellationPolicy: adminProcedure
		.input(cancellationPolicyInputSchema)
		.mutation(({ ctx, input }) =>
			saveCancellationPolicy(ctx.db, input, ctx.user.id),
		),

	listCancellationPolicies: adminProcedure.query(({ ctx }) =>
		listCancellationPolicies(ctx.db),
	),
});
