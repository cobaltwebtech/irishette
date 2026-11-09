import { Link } from '@tanstack/react-router';
import type { RowData } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import {
	BookingStatusBadge,
	PaymentStatusBadge,
} from '@/components/booking/StatusBadges';
import {
	createAppColumnHelper,
	DataTableCard,
	type DataTableCardProps,
	type DataTableOptions,
	sortable,
	useAppTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatStayDate } from '@/lib/timezone';

// Booking lists: shared cells, column presets (admin vs account rows) and
// one `BookingsTable` card. Pages keep choosing which rows to show.

type AdminRow = RouterOutputs['bookings']['adminListBookings'][number];
type AccountRow = RouterOutputs['bookings']['getMyBookings'][number];

/** Confirmation ID linking to the admin or the guest booking page. */
export function BookingLink({
	to,
	publicId,
	children,
}: {
	to: '/admin/bookings/$publicId' | '/account/booking/$publicId';
	publicId: string;
	children: ReactNode;
}) {
	return (
		<Link
			to={to}
			params={{ publicId }}
			className="font-mono text-sm font-semibold text-primary underline hover:text-primary/80"
		>
			{children}
		</Link>
	);
}

/** Check-in date with "to <check-out>" below it. */
export function StayDates({
	checkIn,
	checkOut,
	className,
}: {
	checkIn: string;
	checkOut: string;
	className?: string;
}) {
	return (
		<div>
			<div className={className}>{formatStayDate(checkIn)}</div>
			<div className="text-sm text-muted-foreground">
				to {formatStayDate(checkOut)}
			</div>
		</div>
	);
}

export function Amount({ value }: { value: number }) {
	return <span className="font-medium">${value.toFixed(2)}</span>;
}

const adminHelper = createAppColumnHelper<AdminRow>();

function adminColumns(guestEmailClassName: string) {
	return adminHelper.columns([
		adminHelper.accessor('booking.confirmationId', {
			header: 'Confirmation ID',
			cell: (info) => (
				<BookingLink
					to="/admin/bookings/$publicId"
					publicId={info.row.original.booking.publicId}
				>
					{info.getValue()}
				</BookingLink>
			),
		}),
		adminHelper.accessor('booking.checkInDate', {
			id: 'booking.checkInDate',
			header: sortable('Stay Dates'),
			cell: (info) => (
				<StayDates
					checkIn={info.getValue()}
					checkOut={info.row.original.booking.checkOutDate}
				/>
			),
		}),
		adminHelper.accessor('booking.guestName', {
			header: sortable('Guest'),
			cell: (info) => (
				<div>
					<div className="font-medium">{info.getValue()}</div>
					<div className={guestEmailClassName}>
						{info.row.original.booking.guestEmail}
					</div>
				</div>
			),
		}),
		adminHelper.accessor('room.slug', {
			header: 'Room',
			cell: (info) => (
				<Badge variant="outline" className="capitalize">
					{info.getValue().replace('-', ' ')}
				</Badge>
			),
		}),
		adminHelper.accessor('booking.numberOfGuests', {
			header: 'Guests',
			cell: (info) => info.getValue(),
		}),
		adminHelper.accessor('booking.status', {
			header: 'Status',
			cell: (info) => <BookingStatusBadge status={info.getValue()} />,
		}),
		adminHelper.accessor('booking.paymentStatus', {
			header: 'Payment',
			cell: (info) => <PaymentStatusBadge status={info.getValue()} />,
		}),
		adminHelper.accessor('hasOpenDispute', {
			header: 'Dispute',
			cell: (info) =>
				info.getValue() ? (
					<Badge variant="destructive" className="uppercase">
						Open dispute
					</Badge>
				) : null,
		}),
		adminHelper.accessor('booking.totalAmount', {
			header: sortable('Amount'),
			cell: (info) => <Amount value={info.getValue()} />,
		}),
	]);
}

/** Admin current & upcoming bookings (`bookings.adminListBookings`). */
export const ADMIN_BOOKING_COLUMNS = adminColumns(
	'text-sm text-muted-foreground',
);

/** Admin past bookings: long guest emails wrap. */
export const ADMIN_PAST_BOOKING_COLUMNS = adminColumns(
	'text-sm break-all text-muted-foreground',
);

const accountHelper = createAppColumnHelper<AccountRow>();

/** A guest's own bookings (`bookings.getMyBookings`, guest fields only). */
export const ACCOUNT_BOOKING_COLUMNS = accountHelper.columns([
	accountHelper.accessor('booking.confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<BookingLink
				to="/account/booking/$publicId"
				publicId={info.row.original.booking.publicId}
			>
				{info.getValue()}
			</BookingLink>
		),
	}),
	accountHelper.accessor('booking.checkInDate', {
		id: 'booking.checkInDate',
		header: sortable('Stay Dates'),
		cell: (info) => (
			<StayDates
				checkIn={info.getValue()}
				checkOut={info.row.original.booking.checkOutDate}
				className="font-medium"
			/>
		),
	}),
	accountHelper.accessor('room.name', {
		header: 'Room',
		cell: (info) => (
			<Badge variant="outline" className="capitalize">
				{info.getValue()}
			</Badge>
		),
	}),
	accountHelper.accessor('booking.numberOfGuests', {
		header: 'Guests',
		cell: (info) => info.getValue(),
	}),
	accountHelper.accessor('booking.status', {
		header: 'Status',
		cell: (info) => <BookingStatusBadge status={info.getValue()} />,
	}),
	accountHelper.accessor('booking.totalAmount', {
		header: sortable('Amount'),
		cell: (info) => <Amount value={info.getValue()} />,
	}),
]);

/** Most recent check-in first (past lists) or soonest first. */
export function byCheckIn(desc: boolean) {
	return { sorting: [{ id: 'booking.checkInDate', desc }] };
}

/**
 * A searchable, paginated booking list in a card. Pass one of the column
 * presets above with the rows it was written for.
 */
export function BookingsTable<TData extends RowData>({
	data,
	columns,
	initialState,
	...card
}: Pick<DataTableOptions<TData>, 'data' | 'columns' | 'initialState'> &
	Omit<DataTableCardProps<TData>, 'table'>) {
	const table = useAppTable({ data, columns, initialState });
	return <DataTableCard table={table} {...card} />;
}
