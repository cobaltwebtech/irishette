import { useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';

import {
	AvailabilityCalendar,
	AvailabilityLegend,
} from '@/components/booking/AvailabilityCalendar';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatMoney } from '@/utils/format';
import { cn } from '@/utils/twMerge';

// Admin calendars (plan 06): new bookings by phone and reservation changes.
// The same unavailable ranges as the room pages (bookings, live holds,
// imported events, blocks), today as the earliest check-in (no same-day
// cutoff), optionally without the booking being changed.

interface AdminStayPickerProps {
	roomPublicId: string;
	/** The booking being modified: its own nights are not blocked. */
	excludeBookingPublicId?: string;
	selected: DateRange | undefined;
	onSelect: (range: DateRange | undefined) => void;
}

export function AdminStayPicker({
	roomPublicId,
	excludeBookingPublicId,
	selected,
	onSelect,
}: AdminStayPickerProps) {
	const trpc = useTRPC();
	const { data, isPending, isError, error } = useQuery(
		trpc.availability.adminGetByRoom.queryOptions({
			roomPublicId,
			excludeBookingPublicId,
		}),
	);
	if (isPending) {
		return <p className="text-sm text-muted-foreground">Loading calendar...</p>;
	}
	if (isError) {
		return <p className="text-sm text-destructive">{error.message}</p>;
	}
	return (
		<div className="space-y-4">
			<AvailabilityCalendar
				unavailability={data.unavailability}
				today={data.today}
				earliest={data.earliestCheckIn}
				last={data.lastCheckOut}
				maxNights={data.maxNights}
				selected={selected}
				onSelect={onSelect}
			/>
			<AvailabilityLegend />
		</div>
	);
}

type Quote = Pick<
	RouterOutputs['bookings']['adminQuote'],
	'baseAmount' | 'feesAmount' | 'taxAmount' | 'totalAmount' | 'numberOfNights'
>;

type Tone = 'current' | 'after';

const BREAKDOWN_TONES: Record<
	Tone,
	{ card: string; badge: string; label: string }
> = {
	current: {
		card: 'border-border bg-muted',
		badge: 'bg-foreground/10 text-foreground',
		label: 'Current',
	},
	after: {
		card: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40',
		badge: 'bg-sky-600 text-white',
		label: 'Updated',
	},
};

/** "+$25.00" / "−$25.00": what a line moved by, nothing when it didn't. */
function Delta({ amount }: { amount: number }) {
	const cents = Math.round(amount * 100);
	if (cents === 0) return null;
	return (
		<span
			className={cn(
				'rounded px-1.5 text-xs font-medium tabular-nums',
				cents > 0
					? 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
					: 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
			)}
		>
			{cents > 0 ? '+' : '−'}
			{formatMoney(Math.abs(cents) / 100)}
		</span>
	);
}

/**
 * Room, fee, tax and total lines of a quote or a booking. With `tone` it is
 * one side of a before/after comparison; `compareTo` marks the lines that
 * moved against the other side.
 */
export function PriceBreakdown({
	quote,
	title,
	tone,
	compareTo,
}: {
	quote: Quote;
	title?: string;
	tone?: Tone;
	compareTo?: Quote;
}) {
	const rows: Array<[string, number, number | undefined]> = [
		[
			`Room, ${quote.numberOfNights} night${quote.numberOfNights === 1 ? '' : 's'}`,
			quote.baseAmount,
			compareTo?.baseAmount,
		],
		[
			'Service fee',
			quote.feesAmount ?? 0,
			compareTo && (compareTo.feesAmount ?? 0),
		],
		[
			'Hotel occupancy taxes',
			quote.taxAmount ?? 0,
			compareTo && (compareTo.taxAmount ?? 0),
		],
	];
	const styles = tone ? BREAKDOWN_TONES[tone] : undefined;
	return (
		<div
			className={cn(
				'space-y-1 rounded-lg border p-4 text-sm',
				styles?.card ?? 'bg-muted',
				tone === 'after' && 'border-2',
			)}
		>
			{(title || styles) && (
				<div className="mb-2 flex items-center justify-between gap-2">
					{title && <p className="font-semibold">{title}</p>}
					{styles && (
						<span
							className={cn(
								'rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase',
								styles.badge,
							)}
						>
							{styles.label}
						</span>
					)}
				</div>
			)}
			{rows.map(([label, amount, before]) => (
				<div key={label} className="flex justify-between gap-4">
					<span>{label}</span>
					<span className="flex items-center gap-2 tabular-nums">
						{before !== undefined && <Delta amount={amount - before} />}
						{formatMoney(amount)}
					</span>
				</div>
			))}
			<div className="flex justify-between gap-4 border-t pt-2 font-semibold">
				<span>Total</span>
				<span className="flex items-center gap-2 tabular-nums">
					{compareTo && (
						<Delta amount={quote.totalAmount - compareTo.totalAmount} />
					)}
					{formatMoney(quote.totalAmount)}
				</span>
			</div>
		</div>
	);
}
