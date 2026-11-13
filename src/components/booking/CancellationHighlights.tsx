import { useSuspenseQuery } from '@tanstack/react-query';

import { useTRPC } from '@/integrations/trpc/react';
import { describeTiers } from '@/lib/booking/cancellation-policy';

/**
 * The active cancellation policy in a few lines (e.g. "At least 7 days before
 * check-in: full refund"). Read from the saved policy, never hardcoded, so it
 * matches what a cancellation refunds. The route needs to preload
 * `policies.getCancellationPolicy` in its loader.
 */
export function CancellationHighlights({ className }: { className?: string }) {
	const trpc = useTRPC();
	const { data: policy } = useSuspenseQuery(
		trpc.policies.getCancellationPolicy.queryOptions(),
	);
	return (
		<ul className={className}>
			{describeTiers(policy.tiers).map((tier) => (
				<li key={tier.label}>
					{tier.label}:{' '}
					<strong>
						{tier.refundPercent === 100
							? 'full refund'
							: tier.refundPercent === 0
								? 'no refund'
								: `${tier.refundPercent}% refund`}
					</strong>
				</li>
			))}
		</ul>
	);
}
