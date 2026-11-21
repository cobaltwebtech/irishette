import { useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';

import {
	AvailabilityCalendar,
	AvailabilityLegend,
} from '@/components/booking/AvailabilityCalendar';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatMoney } from '@/utils/format';

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

/** Room, fee, tax and total lines of a quote or a booking. */
export function PriceBreakdown({
	quote,
	title,
}: {
	quote: Quote;
	title?: string;
}) {
	const rows: Array<[string, number]> = [
		[
			`Room, ${quote.numberOfNights} night${quote.numberOfNights === 1 ? '' : 's'}`,
			quote.baseAmount,
		],
		['Service fee', quote.feesAmount ?? 0],
		['Hotel occupancy taxes', quote.taxAmount ?? 0],
	];
	return (
		<div className="space-y-1 rounded-lg border bg-muted p-4 text-sm">
			{title && <p className="mb-2 font-semibold">{title}</p>}
			{rows.map(([label, amount]) => (
				<div key={label} className="flex justify-between gap-4">
					<span>{label}</span>
					<span>{formatMoney(amount)}</span>
				</div>
			))}
			<div className="flex justify-between gap-4 border-t pt-2 font-semibold">
				<span>Total</span>
				<span>{formatMoney(quote.totalAmount)}</span>
			</div>
		</div>
	);
}
