import { Link } from '@tanstack/react-router';

import {
	type CancellationTier,
	refundCutoffs,
} from '@/lib/cancellation-policy';
import type { IsoDate } from '@/lib/date-range';
import { CHECK_IN_TIME_LABEL } from '@/lib/site';
import { checkInAt } from '@/lib/stay-times';
import { formatInstantCT } from '@/lib/timezone';

/**
 * The cancellation windows for a stay, with each tier's cutoff in Central
 * Time (never the browser's time zone), e.g. "Full refund until Tue, Jun 7,
 * 2030, 4:00 PM CT".
 */
export function CancellationPolicySummary({
	tiers,
	checkInDate,
	className,
}: {
	tiers: CancellationTier[];
	checkInDate: IsoDate;
	className?: string;
}) {
	const cutoffs = refundCutoffs({ tiers }, checkInDate);
	return (
		<div className={className}>
			<ul className="space-y-1 text-sm">
				{cutoffs.map((c, i) =>
					c.refundPercent > 0 ? (
						<li key={c.minHoursBefore}>
							<strong>
								{c.refundPercent === 100
									? 'Full refund'
									: `${c.refundPercent}% refund`}
							</strong>{' '}
							until {formatInstantCT(c.until)}
						</li>
					) : (
						<li key={c.minHoursBefore}>
							No refund
							{i > 0 ? ` after ${formatInstantCT(cutoffs[i - 1].until)}` : ''}
						</li>
					),
				)}
				<li className="text-muted-foreground">
					Online cancellation closes at check-in,{' '}
					{formatInstantCT(checkInAt(checkInDate))}
				</li>
			</ul>
			<p className="mt-1 text-xs text-muted-foreground">
				Windows count back from check-in at {CHECK_IN_TIME_LABEL}. Refunds are a
				percent of the total paid, including taxes and fees.{' '}
				<Link
					to="/cancellation-refund-policy"
					target="_blank"
					className="underline"
				>
					Full policy
				</Link>
			</p>
		</div>
	);
}
