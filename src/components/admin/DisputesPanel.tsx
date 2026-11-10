import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { stripeDisputeUrl } from '@/lib/inbox/inbox';
import { formatMoney, humanizeCode } from '@/utils/format';
import { formatInstantCT } from '@/utils/timezone';

type Dispute = RouterOutputs['bookings']['adminGetBooking']['disputes'][number];

const CLOSED = new Set(['won', 'lost', 'warning_closed', 'prevented']);

/** True while a dispute still needs attention (not won/lost/closed). */
export const isOpenDispute = (status: string) => !CLOSED.has(status);

/**
 * Stripe disputes on a booking's payment or a guest's payments (stored from
 * the charge.dispute.* webhooks). Renders nothing when there are none.
 */
export function DisputesPanel({
	disputes,
	className,
	showBooking = false,
}: {
	disputes: Dispute[];
	className?: string;
	showBooking?: boolean;
}) {
	if (disputes.length === 0) return null;
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:gavel" className="size-5" />
					Payment disputes
				</CardTitle>
				<CardDescription>
					Chargebacks reported by Stripe. Respond in the Stripe Dashboard. Dates
					and times are Central Time.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{disputes.map((d) => {
					const open = isOpenDispute(d.status);
					return (
						<div
							key={d.stripeDisputeId}
							className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2"
						>
							<div className="flex flex-wrap items-center gap-2 sm:col-span-2">
								<Badge variant={open ? 'destructive' : 'secondary'}>
									{humanizeCode(d.status)}
								</Badge>
								<span className="font-semibold">
									{formatMoney(d.amount, d.currency)}
								</span>
								<span className="text-muted-foreground">
									{humanizeCode(d.reason)}
								</span>
								{d.cardBrand && d.cardLast4 && (
									<span className="text-muted-foreground">
										{d.cardBrand.toUpperCase()} ending {d.cardLast4}
									</span>
								)}
							</div>
							{showBooking && (
								<p>
									Booking:{' '}
									{d.bookingPublicId && d.confirmationId ? (
										<Link
											to="/admin/bookings/$publicId"
											params={{ publicId: d.bookingPublicId }}
											className="font-mono text-primary hover:underline"
										>
											{d.confirmationId}
										</Link>
									) : (
										'Unlinked payment'
									)}
								</p>
							)}
							<p>Opened: {formatInstantCT(d.stripeCreatedAt)}</p>
							{open && d.evidenceDueBy && (
								<p className="font-medium text-destructive">
									Respond by: {formatInstantCT(d.evidenceDueBy)}
								</p>
							)}
							{d.closedAt && <p>Closed: {formatInstantCT(d.closedAt)}</p>}
							{d.fundsWithdrawnAt && (
								<p>Funds withdrawn: {formatInstantCT(d.fundsWithdrawnAt)}</p>
							)}
							{d.fundsReinstatedAt && (
								<p>Funds reinstated: {formatInstantCT(d.fundsReinstatedAt)}</p>
							)}
							<p className="sm:col-span-2">
								<a
									href={stripeDisputeUrl(d.stripeDisputeId, d.livemode)}
									target="_blank"
									rel="noreferrer noopener"
									className="inline-flex items-center gap-1 text-primary hover:underline"
								>
									Open in Stripe
									<Icon icon="tabler:external-link" className="size-4" />
								</a>
							</p>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
