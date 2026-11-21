import { Icon } from '@iconify/react';

import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatMoney } from '@/utils/format';
import { cn } from '@/utils/twMerge';

// Admin reservation changes (plan 06): what happens to the money once the
// admin confirms. A refund is shown as a negative amount going back to the
// guest's card, a charge as a positive amount, with the reason spelled out.

export type ModificationQuote =
	RouterOutputs['bookings']['adminQuoteModification'];

type Outcome = 'refund' | 'charge' | 'none';

const TONES: Record<
	Outcome,
	{ card: string; badge: string; amount: string; icon: string; label: string }
> = {
	refund: {
		card: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
		badge: 'bg-emerald-600 text-white',
		amount: 'text-emerald-700 dark:text-emerald-400',
		icon: 'tabler:arrow-back-up',
		label: 'Refund to guest',
	},
	charge: {
		card: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
		badge: 'bg-amber-600 text-white',
		amount: 'text-amber-700 dark:text-amber-400',
		icon: 'tabler:credit-card',
		label: 'Charge to guest',
	},
	none: {
		card: 'border-border bg-muted',
		badge: 'bg-foreground text-background',
		amount: 'text-foreground',
		icon: 'tabler:equal',
		label: 'No payment change',
	},
};

/** Positive: charged to the guest. Negative: returned to the guest. */
function signedMoney(cents: number) {
	if (cents === 0) return formatMoney(0);
	return `${cents < 0 ? '−' : '+'}${formatMoney(Math.abs(cents) / 100)}`;
}

function outcomeOf(cents: number): Outcome {
	if (cents < 0) return 'refund';
	return cents > 0 ? 'charge' : 'none';
}

/** Where the money goes, in words. */
function destination(q: ModificationQuote, outcome: Outcome): string {
	const amount = formatMoney(Math.abs(q.differenceCents) / 100);
	if (outcome === 'refund') {
		return `${amount} goes back to the card the guest paid with.`;
	}
	if (outcome === 'charge') {
		const saved = q.savedCard;
		if (!saved) {
			return `${amount} is charged to a card the guest reads out: there is no card on file we can use.`;
		}
		return saved.type === 'link'
			? `${amount} is charged to the guest's Link account on file.`
			: `${amount} is charged to the ${saved.brand ?? 'card'} ending ${saved.last4 ?? '????'} on file.`;
	}
	return 'The new stay costs the same as the current one: nothing is charged or refunded.';
}

/** Why that amount, as short lines. */
function explanation(q: ModificationQuote, outcome: Outcome): string[] {
	const price = (cents: number) => formatMoney(cents / 100);
	if (outcome === 'none') return [];
	if (q.refundPercent !== null) {
		const kept = q.differenceCents - q.priceDifferenceCents;
		return [
			`The new stay is ${price(Math.abs(q.priceDifferenceCents))} less than the current total.`,
			`The dropped nights fall under the cancellation policy: ${q.refundPercent}% of that difference is refunded and ${price(kept)} is kept.`,
		];
	}
	if (outcome === 'refund') {
		return [
			`The whole stay is repriced at today's rates, and the new stay is ${price(Math.abs(q.priceDifferenceCents))} less than the current total.`,
			'The full difference is refunded: no nights are dropped under the cancellation policy.',
		];
	}
	return [
		`The whole stay is repriced at today's rates, and the new stay is ${price(q.priceDifferenceCents)} more than the current total.`,
		'Only the difference is charged: the guest does not pay for the stay twice.',
	];
}

function Line({
	label,
	value,
	strong,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div
			className={cn(
				'flex justify-between gap-4',
				strong && 'border-t pt-2 font-semibold',
			)}
		>
			<span>{label}</span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

export function PaymentSummaryCard({ quote: q }: { quote: ModificationQuote }) {
	const outcome = outcomeOf(q.differenceCents);
	const tone = TONES[outcome];
	const lines = explanation(q, outcome);
	const kept =
		q.refundPercent === null ? 0 : q.differenceCents - q.priceDifferenceCents;
	return (
		<section
			aria-label="Payment summary"
			className={cn('space-y-4 rounded-lg border-2 p-5', tone.card)}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-2">
					<span
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase',
							tone.badge,
						)}
					>
						<Icon icon={tone.icon} className="size-4" />
						{tone.label}
					</span>
					<p className="text-sm">{destination(q, outcome)}</p>
				</div>
				<p
					className={cn(
						'text-4xl font-bold tracking-tight tabular-nums',
						tone.amount,
					)}
				>
					{signedMoney(q.differenceCents)}
				</p>
			</div>
			{lines.length > 0 && (
				<ul className="space-y-1 text-sm text-muted-foreground">
					{lines.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			)}
			<div className="space-y-1 rounded-md bg-background/70 p-3 text-sm">
				<Line
					label="Current booking total"
					value={formatMoney(q.current.totalAmount)}
				/>
				<Line label="New stay price" value={formatMoney(q.next.totalAmount)} />
				<Line
					label="Price difference"
					value={signedMoney(q.priceDifferenceCents)}
				/>
				{kept !== 0 && (
					<Line
						label={`Kept under the cancellation policy (${100 - (q.refundPercent ?? 0)}%)`}
						value={formatMoney(kept / 100)}
					/>
				)}
				<Line
					label="New booking total"
					value={formatMoney(q.newTotal)}
					strong
				/>
			</div>
		</section>
	);
}
