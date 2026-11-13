import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { PaymentStatusBadge } from '@/components/booking/StatusBadges';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { storedArrivalLabel } from '@/lib/booking/arrival-windows';
import type { BookingStatus } from '@/lib/booking/booking-status';
import {
	CHECK_IN_TIME_LABEL,
	CHECK_OUT_TIME_LABEL,
	CONTACT_PHONE,
	CONTACT_PHONE_HREF,
	HOUSE_RULES,
	PARKING_NOTE,
} from '@/lib/site';
import { formatStayDate } from '@/utils/timezone';

// Presentational cards shared by the guest booking page, the booking
// confirmation page and the admin booking page. They take only fields the
// guest procedure (`bookings.getBooking`) returns, so they can never show
// admin-only data; admin-only panels stay on the admin page.

type GuestBooking = RouterOutputs['bookings']['getBooking']['booking'];

type StayFields = Pick<
	GuestBooking,
	| 'confirmationId'
	| 'checkInDate'
	| 'checkOutDate'
	| 'numberOfNights'
	| 'numberOfGuests'
	| 'estimatedArrival'
>;

type PaymentFields = Pick<
	GuestBooking,
	| 'baseAmount'
	| 'numberOfNights'
	| 'feesAmount'
	| 'taxAmount'
	| 'totalAmount'
	| 'paymentStatus'
>;

const plural = (count: number, noun: string) =>
	`${count} ${noun}${count !== 1 ? 's' : ''}`;

/** A labelled value: `value` renders as bold text, `children` below it. */
export function DetailField({
	label,
	value,
	children,
}: {
	label: ReactNode;
	value?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div>
			<p className="text-sm font-medium text-muted-foreground">{label}</p>
			{value !== undefined && <p className="font-semibold">{value}</p>}
			{children}
		</div>
	);
}

/** Back link, page title and booking status for a booking detail page. */
export function BookingDetailHeader({
	back,
	title,
	status,
}: {
	back: ReactNode;
	title: ReactNode;
	status: BookingStatus;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			{back}
			<h1 className="text-2xl font-bold text-foreground">{title}</h1>
			<Badge
				variant={status === 'cancelled' ? 'destructive' : 'secondary'}
				className="text-sm"
			>
				{status.toUpperCase()}
			</Badge>
		</div>
	);
}

/** Confirmation ID, room, stay dates, nights and guests. */
export function BookingStayCard({
	title,
	booking,
	roomName,
}: {
	title: string;
	booking: StayFields;
	roomName: string;
}) {
	return (
		<Card className="lg:col-span-4">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 sm:grid-cols-2">
				<DetailField label="Confirmation ID">
					<Badge
						variant="secondary"
						className="font-mono text-lg font-semibold tracking-wider"
					>
						{booking.confirmationId}
					</Badge>
				</DetailField>
				<DetailField label="Room" value={roomName} />
				<DetailField
					label="Check-in"
					value={formatStayDate(booking.checkInDate, 'full')}
				>
					<p className="text-sm text-muted-foreground">
						From {CHECK_IN_TIME_LABEL}
					</p>
				</DetailField>
				<DetailField
					label="Check-out"
					value={formatStayDate(booking.checkOutDate, 'full')}
				>
					<p className="text-sm text-muted-foreground">
						Before {CHECK_OUT_TIME_LABEL}
					</p>
				</DetailField>
				<DetailField
					label="Estimated Arrival"
					value={storedArrivalLabel(booking.estimatedArrival) ?? 'Not provided'}
				/>
				<DetailField
					label="Duration"
					value={plural(booking.numberOfNights, 'night')}
				/>
				<DetailField
					label="Guests"
					value={plural(booking.numberOfGuests, 'guest')}
				/>
			</CardContent>
		</Card>
	);
}

function ChargeRow({
	label,
	amount,
}: {
	label: string;
	amount: number | null;
}) {
	if (amount === null || amount <= 0) return null;
	return (
		<>
			<p className="text-sm font-medium text-muted-foreground">{label}</p>
			<p className="text-right">${amount.toFixed(2)}</p>
		</>
	);
}

/** Nightly rate, subtotal, fees, taxes and total; optionally the status. */
export function BookingPaymentCard({
	booking,
	totalLabel = 'Total Paid',
	showPaymentStatus = false,
}: {
	booking: PaymentFields;
	totalLabel?: string;
	showPaymentStatus?: boolean;
}) {
	const nights = Math.max(1, booking.numberOfNights);
	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle>Payment Summary</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-x-4 gap-y-2">
					<p className="text-sm font-medium text-muted-foreground">Base Rate</p>
					<p className="text-right">
						${(booking.baseAmount / nights).toFixed(2)}/night
					</p>
					<p className="text-sm font-medium text-muted-foreground">Subtotal</p>
					<p className="text-right">${booking.baseAmount.toFixed(2)}</p>
					<ChargeRow label="Fees" amount={booking.feesAmount} />
					<ChargeRow label="Taxes" amount={booking.taxAmount} />
					<p className="text-lg font-semibold">{totalLabel}</p>
					<p className="text-right text-lg font-semibold">
						${booking.totalAmount.toFixed(2)}
					</p>
				</div>
			</CardContent>
			{showPaymentStatus && (
				<CardFooter className="grid grid-cols-2 border-t">
					<p className="text-sm font-medium text-muted-foreground">
						Payment Status
					</p>
					<p className="text-right">
						<PaymentStatusBadge status={booking.paymentStatus} />
					</p>
				</CardFooter>
			)}
		</Card>
	);
}

/** Guest name and email; `children` adds rows below them. */
export function BookingGuestCard({
	className,
	guestName,
	guestEmail,
	badge,
	children,
}: {
	className: string;
	guestName: string;
	guestEmail: string;
	badge?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Guest Information
					{badge}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2">
					<DetailField label="Name" value={guestName} />
					<DetailField label="Email" value={guestEmail} />
				</div>
				{children}
			</CardContent>
		</Card>
	);
}

export function SpecialRequestsCard({
	className,
	specialRequests,
	emptyText,
}: {
	className: string;
	specialRequests: string | null;
	emptyText: string;
}) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Special Requests</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
					{specialRequests || emptyText}
				</div>
			</CardContent>
		</Card>
	);
}

/** Check-in/out times and where to find the policy and support. */
export function ImportantInfoCard({ className }: { className: string }) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Important Information</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="mx-4 list-disc space-y-2 text-sm text-muted-foreground">
					<li>Check your email for the booking confirmation details</li>
					<li>
						Check-in is available from {CHECK_IN_TIME_LABEL}. Early check-in may
						be available upon request.
					</li>
					<li>
						Check-out is by {CHECK_OUT_TIME_LABEL}. Late check-out may be
						available upon request.
					</li>
					<li>
						If you need to cancel your booking please review our{' '}
						<Link
							to="/cancellation-refund-policy"
							className="text-accent hover:underline"
							target="_blank"
						>
							Cancellation & Refund Policy
						</Link>
						.
					</li>
					<li>
						If you have any questions or need assistance{' '}
						<Link
							to="/contact"
							className="text-accent hover:underline"
							target="_blank"
						>
							Contact Us
						</Link>
						.
					</li>
					<li>
						We will meet you in person to hand over your key and will contact
						you with arrival instructions before your stay. If your plans
						change, call us at{' '}
						<a
							href={CONTACT_PHONE_HREF}
							className="text-accent hover:underline"
						>
							{CONTACT_PHONE}
						</a>
						.
					</li>
					<li>
						{PARKING_NOTE}. {HOUSE_RULES.join('. ')}.
					</li>
				</ul>
			</CardContent>
		</Card>
	);
}
