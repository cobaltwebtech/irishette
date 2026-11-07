import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
	createAppColumnHelper,
	DataTableView,
	PaginationControls,
	SortableHeader,
	useAppTable,
} from '@/components/data-table';
import { EditProfileModal } from '@/components/EditProfileModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';

type BookingRow = RouterOutputs['bookings']['getMyBookings'][number];

const MY_BOOKINGS_INPUT = { limit: 50, offset: 0 };

const columnHelper = createAppColumnHelper<BookingRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('booking.confirmationId', {
		header: 'Confirmation ID',
		cell: (info) => (
			<Link
				to="/account/booking/$publicId"
				params={{ publicId: info.row.original.booking.publicId }}
				className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline"
			>
				{info.getValue()}
			</Link>
		),
	}),
	columnHelper.accessor('booking.checkInDate', {
		id: 'booking.checkInDate',
		header: ({ column }) => (
			<SortableHeader column={column}>Stay Dates</SortableHeader>
		),
		cell: (info) => (
			<div>
				<div className="font-medium">
					{new Date(`${info.getValue()}T00:00:00`).toLocaleDateString()}
				</div>
				<div className="text-sm text-muted-foreground">
					to{' '}
					{new Date(
						`${info.row.original.booking.checkOutDate}T00:00:00`,
					).toLocaleDateString()}
				</div>
			</div>
		),
	}),
	columnHelper.accessor('room.name', {
		header: 'Room',
		cell: (info) => (
			<Badge variant="outline" className="capitalize">
				{info.getValue()}
			</Badge>
		),
	}),
	columnHelper.accessor('booking.numberOfGuests', {
		header: 'Guests',
		cell: (info) => info.getValue(),
	}),
	columnHelper.accessor('booking.status', {
		header: 'Status',
		cell: (info) => (
			<Badge
				variant={
					info.getValue() === 'confirmed'
						? 'default'
						: info.getValue() === 'cancelled'
							? 'destructive'
							: info.getValue() === 'completed'
								? 'default'
								: 'secondary'
				}
				className="capitalize"
			>
				{info.getValue()}
			</Badge>
		),
	}),
	columnHelper.accessor('booking.totalAmount', {
		header: ({ column }) => (
			<SortableHeader column={column}>Amount</SortableHeader>
		),
		cell: (info) => (
			<span className="font-medium">${info.getValue().toFixed(2)}</span>
		),
	}),
]);

export const Route = createFileRoute('/_authed/account/')({
	head: () => ({
		meta: [
			{
				title: 'My Account | Irishette.com',
			},
		],
	}),
	// Auth: the _authed layout. Bookings are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
		),
	component: AccountPage,
});

function AccountPage() {
	// Minimal session user from the _authed layout (refreshed by
	// refreshSession after profile edits).
	const { user } = Route.useRouteContext();
	const trpc = useTRPC();
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const { data: allBookings } = useSuspenseQuery(
		trpc.bookings.getMyBookings.queryOptions(MY_BOOKINGS_INPUT),
	);

	// Current and upcoming confirmed bookings (checkout today or later).
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const bookings = allBookings.filter((booking) => {
		const checkOutDate = new Date(`${booking.booking.checkOutDate}T00:00:00`);
		return checkOutDate >= today && booking.booking.status === 'confirmed';
	});

	const table = useAppTable({
		data: bookings,
		columns,
		initialState: {
			sorting: [{ id: 'booking.checkInDate', desc: false }],
		},
	});

	return (
		<div className="bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Welcome back, {user.name || user.email}
							</h1>
							<p className="text-muted-foreground">
								Manage your bookings and account settings
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				{/* Conditional Rendering: Show table if bookings exist, otherwise show empty state */}
				{bookings.length > 0 ? (
					<Card className="mb-8">
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<CardTitle>
										Current & Upcoming Bookings (
										{table.getFilteredRowModel().rows.length})
									</CardTitle>
									<CardDescription>
										Your current and upcoming confirmed bookings. Click on the
										confirmation ID to view more details.
									</CardDescription>
								</div>
								<div className="relative">
									<Icon
										icon="tabler:search"
										className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4"
									/>
									<Input
										placeholder="Search bookings..."
										value={table.state.globalFilter ?? ''}
										onChange={(event) =>
											table.setGlobalFilter(String(event.target.value))
										}
										className="pl-8 w-[250px]"
									/>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<DataTableView table={table} emptyMessage="No bookings found." />
							<PaginationControls table={table} noun="bookings" />
						</CardContent>
						<CardFooter>
							<Button asChild variant="outline">
								<Link to="/account/past-bookings">
									<Icon icon="tabler:calendar-repeat" className="size-5" />
									View Past Bookings
								</Link>
							</Button>
						</CardFooter>
					</Card>
				) : (
					<Card className="mb-8">
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Icon
								icon="tabler:calendar-question"
								className="size-16 text-muted-foreground mb-4"
							/>
							<h3 className="text-xl font-semibold mb-2">
								No Current Bookings
							</h3>
							<p className="text-muted-foreground text-center mb-6 max-w-md">
								You have no current or upcoming bookings. Start exploring our
								available rooms and make your next reservation!
							</p>
							<div className="flex gap-2">
								<Button asChild>
									<Link to="/">Browse Rooms</Link>
								</Button>
								<Button asChild variant="outline">
									<Link to="/account/past-bookings">
										<Icon icon="tabler:calendar-repeat" className="size-5" />
										View Past Bookings
									</Link>
								</Button>{' '}
							</div>
						</CardContent>
					</Card>
				)}

				<div className="grid gap-6 md:grid-cols-2">
					{/* Account Info Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Icon icon="tabler:user-circle" className="size-5 mr-2" />
								Account Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div>
									<p className="text-sm text-muted-foreground">Name</p>
									<p className="text-foreground font-semibold">{user.name}</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Email</p>
									<p className="text-foreground font-semibold">
										<Icon icon="tabler:mail" className="size-4 inline mr-1" />
										{user.email}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Phone Number</p>
									<p className="text-foreground font-semibold">
										<Icon icon="tabler:phone" className="size-4 inline mr-1" />
										{user.phoneNumber || 'Not provided'}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Member Since</p>
									<p className="text-foreground font-semibold">
										{new Date(user.createdAt).toLocaleDateString('en-US', {
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Quick Actions Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Icon icon="tabler:settings" className="size-5 mr-2" />
								Quick Actions
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<p>Update Profile</p>
								<Button onClick={() => setIsEditModalOpen(true)}>
									<Icon icon="tabler:pencil" className="size-4 inline mr-1" />
									Edit Your Information
								</Button>
							</div>
							<div>
								<p>Have questions or need assistance?</p>
								<Button asChild variant="secondary">
									<Link to="/contact">
										<Icon icon="tabler:message-circle" className="size-4" />
										Contact Us
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Edit Profile Modal */}
				<EditProfileModal
					open={isEditModalOpen}
					onOpenChange={setIsEditModalOpen}
					user={{
						id: user.id,
						name: user.name || '',
						email: user.email,
						phoneNumber: user.phoneNumber,
					}}
				/>
			</div>
		</div>
	);
}
