import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import type {
	BookingStatus,
	PaymentStatus,
} from '@/lib/booking/booking-status';
import { formatMoney } from '@/utils/format';

import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadges';

interface Row {
	booking: {
		publicId: string;
		confirmationId: string;
		checkInDate: string;
		checkOutDate: string;
		status: BookingStatus;
		paymentStatus: PaymentStatus;
		totalAmount: number;
	};
	room: { name: string };
}

/**
 * A short list of a guest's bookings (awaiting payment, cancelled) on the
 * account page. Renders nothing when empty.
 */
export function BookingSummaryList({
	title,
	description,
	rows,
	className,
}: {
	title: string;
	description: ReactNode;
	rows: Row[];
	className?: string;
}) {
	if (rows.length === 0) return null;
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>
					{title} ({rows.length})
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="divide-y">
					{rows.map(({ booking, room }) => (
						<li
							key={booking.publicId}
							className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
						>
							<div>
								<Link
									to="/account/booking/$publicId"
									params={{ publicId: booking.publicId }}
									className="font-mono font-semibold text-primary underline hover:text-primary/80"
								>
									{booking.confirmationId}
								</Link>{' '}
								<span className="text-muted-foreground">
									{room.name}, {booking.checkInDate} to {booking.checkOutDate}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="font-medium">
									{formatMoney(booking.totalAmount)}
								</span>
								<BookingStatusBadge status={booking.status} />
								<PaymentStatusBadge status={booking.paymentStatus} />
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
