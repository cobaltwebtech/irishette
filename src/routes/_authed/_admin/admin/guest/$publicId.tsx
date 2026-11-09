import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { DisputesPanel } from '@/components/admin/DisputesPanel';
import { NotificationsPanel } from '@/components/admin/inbox/NotificationsPanel';
import {
	Amount,
	BookingLink,
	StayDates,
} from '@/components/booking/BookingsTable';
import {
	BookingStatusBadge,
	PaymentStatusBadge,
} from '@/components/booking/StatusBadges';
import {
	createAppColumnHelper,
	DataTableView,
	PaginationControls,
	sortable,
	useAppTable,
} from '@/components/data-table';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatDateCT } from '@/lib/timezone';

type BookingRow =
	RouterOutputs['users']['adminGetGuestDetails']['bookings'][number];

const columnHelper = createAppColumnHelper<BookingRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<BookingLink
				to="/admin/bookings/$publicId"
				publicId={info.row.original.publicId}
			>
				{info.getValue()}
			</BookingLink>
		),
	}),
	columnHelper.accessor('checkInDate', {
		header: sortable('Check-in'),
		cell: (info) => (
			<StayDates
				checkIn={info.getValue()}
				checkOut={info.row.original.checkOutDate}
			/>
		),
	}),
	columnHelper.accessor('numberOfNights', {
		header: 'Nights',
		cell: (info) =>
			`${info.getValue()} night${info.getValue() !== 1 ? 's' : ''}`,
	}),
	columnHelper.accessor('numberOfGuests', {
		header: 'Guests',
		cell: (info) => info.getValue(),
	}),
	columnHelper.accessor('status', {
		header: 'Status',
		cell: (info) => <BookingStatusBadge status={info.getValue()} />,
	}),
	columnHelper.accessor('paymentStatus', {
		header: 'Payment',
		cell: (info) => <PaymentStatusBadge status={info.getValue()} />,
	}),
	columnHelper.accessor('totalAmount', {
		header: sortable('Amount'),
		cell: (info) => <Amount value={info.getValue()} />,
	}),
]);

export const Route = createFileRoute('/_authed/_admin/admin/guest/$publicId')({
	head: () => ({
		meta: [
			{
				title: 'Guest Details | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Guest details are preloaded for SSR.
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.users.adminGetGuestDetails.queryOptions({
					publicId: params.publicId,
				}),
			),
		),
	notFoundComponent: GuestNotFound,
	component: AdminGuestDetail,
});

function GuestNotFound() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="text-center">
				<h2 className="mb-4 text-2xl font-bold">Guest Not Found</h2>
				<p className="mb-4 text-muted-foreground">
					The guest you're looking for could not be found.
				</p>
				<div className="flex justify-center gap-2">
					<Link to="/admin/guest">
						<Button variant="outline">Back to Guests</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}

function AdminGuestDetail() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();

	const { data: guestData } = useSuspenseQuery(
		trpc.users.adminGetGuestDetails.queryOptions({ publicId }),
	);

	const { user, bookings } = guestData;

	const table = useAppTable({
		data: bookings,
		columns,
		initialState: {
			sorting: [{ id: 'checkInDate', desc: true }],
			pagination: { pageIndex: 0, pageSize: 10 },
		},
	});

	// Statistics (stay phase from the server, in property time)
	const totalBookings = bookings.length;

	// A stay is completed once it is confirmed and past check-out.
	const completedBookings = bookings.filter(
		(b) => b.status === 'confirmed' && b.stayPhase === 'past',
	).length;

	const cancelledBookings = bookings.filter(
		(b) => b.status === 'cancelled',
	).length;

	const totalSpent = bookings
		.filter(
			(b) =>
				b.paymentStatus === 'paid' || b.paymentStatus === 'partially_refunded',
		)
		.reduce((sum, b) => sum + b.totalAmount - (b.refundAmount ?? 0), 0);

	// Current & upcoming: confirmed and not past check-out.
	const currentUpcomingBookings = bookings.filter(
		(b) => b.status === 'confirmed' && b.stayPhase !== 'past',
	).length;

	return (
		<AdminLayout title={`Guest: ${user.name}`}>
			<div className="mb-6">
				<Link to="/admin/guest">
					<Button variant="outline" size="sm">
						← Back to Guests
					</Button>
				</Link>
			</div>

			<div className="mb-8 grid gap-6 lg:grid-cols-3">
				{/* Guest Information Card */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Guest Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<p className="text-sm font-medium text-muted-foreground">Name</p>
							<p className="font-semibold">{user.name}</p>
						</div>
						<div>
							<p className="text-sm font-medium text-muted-foreground">Email</p>
							<a
								href={`mailto:${user.email}`}
								className="font-semibold text-primary hover:underline"
							>
								{user.email}
							</a>
						</div>
						{user.phoneNumber && (
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Phone
								</p>
								<a
									href={`tel:${user.phoneNumber}`}
									className="font-semibold text-primary hover:underline"
								>
									{user.phoneNumber}
								</a>
							</div>
						)}
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Member Since
							</p>
							<p className="font-semibold">
								{formatDateCT(user.createdAt, 'long')}
							</p>
						</div>
						{user.stripeCustomerId && (
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Stripe Customer ID
								</p>
								<p className="gap-2 font-mono break-all text-primary">
									<a
										href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
										rel="noopener noreferrer"
										target="_blank"
										className="flex gap-2 hover:underline"
									>
										{user.stripeCustomerId}
										<Icon icon="tabler:external-link" className="size-5" />
									</a>
								</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Statistics Cards */}
				<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:col-span-2">
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Total Bookings</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{totalBookings}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Current & Upcoming</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-blue-600">
								{currentUpcomingBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Completed</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-green-600">
								{completedBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Cancelled</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-red-600">
								{cancelledBookings}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Total Spent</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">${totalSpent.toFixed(2)}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-3">
							<CardDescription>Avg. Booking</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								$
								{totalBookings
									? (totalSpent / totalBookings).toFixed(2)
									: '0.00'}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<DisputesPanel disputes={guestData.disputes} showBooking />

			<NotificationsPanel userPublicId={user.publicId} />

			{/* Bookings History */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Booking History ({bookings.length})
					</CardTitle>
					<CardDescription>All bookings made by this guest</CardDescription>
				</CardHeader>
				<CardContent>
					{bookings.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							No bookings found for this guest.
						</div>
					) : (
						<>
							<ScrollArea className="w-full">
								<DataTableView
									table={table}
									emptyMessage="No bookings found."
								/>
								<ScrollBar orientation="horizontal" />
							</ScrollArea>
							<PaginationControls table={table} noun="bookings" />
						</>
					)}
				</CardContent>
			</Card>
		</AdminLayout>
	);
}
