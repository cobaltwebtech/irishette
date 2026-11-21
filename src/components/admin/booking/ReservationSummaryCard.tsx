import { DetailField } from '@/components/booking/detail/BookingDetailCards';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { CHECK_IN_TIME_LABEL, CHECK_OUT_TIME_LABEL } from '@/lib/site';
import { formatMoney } from '@/utils/format';
import { formatStayDate } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

// The reservation an admin is taking payment for (new booking by phone,
// plan 06), shown beside the card form so it can be read back to the guest.

export interface ReservationSummary {
	roomName: string;
	checkIn: string;
	checkOut: string;
	numberOfNights: number;
	guestCount: number;
	guestName: string;
	guestEmail: string;
	guestPhone: string;
	/** The arrival window label ("4:00 PM to 6:00 PM"), if known. */
	arrival: string | null;
	specialRequests: string;
	totalAmount: number;
	lateSameDay: boolean;
}

export function ReservationSummaryCard({
	summary,
	className,
}: {
	summary: ReservationSummary;
	className?: string;
}) {
	const nights = `${summary.numberOfNights} night${summary.numberOfNights === 1 ? '' : 's'}`;
	return (
		<Card className={cn('h-fit', className)}>
			<CardHeader>
				<CardTitle>Reservation</CardTitle>
				<CardDescription>
					Read it back to the guest before taking the card.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<DetailField label="Room" value={summary.roomName} />
					<DetailField
						label="Stay"
						value={`${nights}, ${summary.guestCount} guest${summary.guestCount === 1 ? '' : 's'}`}
					/>
					<DetailField
						label="Check-in"
						value={formatStayDate(summary.checkIn, 'long')}
					>
						<p className="text-sm text-muted-foreground">
							From {CHECK_IN_TIME_LABEL}
						</p>
					</DetailField>
					<DetailField
						label="Check-out"
						value={formatStayDate(summary.checkOut, 'long')}
					>
						<p className="text-sm text-muted-foreground">
							By {CHECK_OUT_TIME_LABEL}
						</p>
					</DetailField>
				</div>
				<div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
					<DetailField label="Guest" value={summary.guestName} />
					<DetailField label="Phone" value={summary.guestPhone} />
					<DetailField
						label="Email"
						value={<span className="break-all">{summary.guestEmail}</span>}
					/>
					{summary.arrival && (
						<DetailField label="Estimated arrival" value={summary.arrival} />
					)}
				</div>
				{summary.specialRequests && (
					<DetailField label="Special requests">
						<p className="rounded-md bg-muted p-3 text-sm">
							{summary.specialRequests}
						</p>
					</DetailField>
				)}
				{summary.lateSameDay && (
					<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
						Late same-day booking: non-refundable if cancelled.
					</p>
				)}
				<div className="flex items-baseline justify-between border-t pt-4">
					<span className="font-semibold">Total</span>
					<span className="text-xl font-bold tabular-nums">
						{formatMoney(summary.totalAmount)}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}
