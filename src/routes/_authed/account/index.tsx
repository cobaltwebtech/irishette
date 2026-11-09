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
import { Button, buttonVariants } from '@/components/ui/button';
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
import { cn } from '@/utils/twMerge';

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
				className="font-mono text-sm font-semibold text-primary underline hover:text-primary/80"
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
			<div className="border-b bg-primary/5">
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
										className="absolute top-1/2 left-2 size-4 -translate-y-1/2 transform text-muted-foreground"
									/>
									<Input
										placeholder="Search bookings..."
										value={table.state.globalFilter ?? ''}
										onChange={(event) =>
											table.setGlobalFilter(String(event.target.value))
										}
										className="w-[250px] pl-8"
									/>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<DataTableView table={table} emptyMessage="No bookings found." />
							<PaginationControls table={table} noun="bookings" />
						</CardContent>
						<CardFooter>
							<Link
								to="/account/past-bookings"
								data-slot="button"
								className={cn(buttonVariants({ variant: 'outline' }))}
							>
								<Icon icon="tabler:calendar-repeat" className="size-5" />
								View Past Bookings
							</Link>
						</CardFooter>
					</Card>
				) : (
					<Card className="mb-8">
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Icon
								icon="tabler:calendar-question"
								className="mb-4 size-16 text-muted-foreground"
							/>
							<h3 className="mb-2 text-xl font-semibold">
								No Current Bookings
							</h3>
							<p className="mb-6 max-w-md text-center text-muted-foreground">
								You have no current or upcoming bookings. Start exploring our
								available rooms and make your next reservation!
							</p>
							<div className="flex gap-2">
								<Link
									to="/"
									data-slot="button"
									className={cn(buttonVariants())}
								>
									Browse Rooms
								</Link>
								<Link
									to="/account/past-bookings"
									data-slot="button"
									className={cn(buttonVariants({ variant: 'outline' }))}
								>
									<Icon icon="tabler:calendar-repeat" className="size-5" />
									View Past Bookings
								</Link>{' '}
							</div>
						</CardContent>
					</Card>
				)}

				<div className="grid gap-6 md:grid-cols-2">
					{/* Account Info Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Icon icon="tabler:user-circle" className="mr-2 size-5" />
								Account Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div>
									<p className="text-sm text-muted-foreground">Name</p>
									<p className="font-semibold text-foreground">{user.name}</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Email</p>
									<p className="font-semibold text-foreground">
										<Icon icon="tabler:mail" className="mr-1 inline size-4" />
										{user.email}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Phone Number</p>
									<p className="font-semibold text-foreground">
										<Icon icon="tabler:phone" className="mr-1 inline size-4" />
										{user.phoneNumber || 'Not provided'}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Member Since</p>
									<p className="font-semibold text-foreground">
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
								<Icon icon="tabler:settings" className="mr-2 size-5" />
								Quick Actions
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<p>Update Profile</p>
								<Button onClick={() => setIsEditModalOpen(true)}>
									<Icon icon="tabler:pencil" className="mr-1 inline size-4" />
									Edit Your Information
								</Button>
							</div>
							<div>
								<p>Have questions or need assistance?</p>
								<Link
									to="/contact"
									data-slot="button"
									className={cn(buttonVariants({ variant: 'secondary' }))}
								>
									<Icon icon="tabler:message-circle" className="size-4" />
									Contact Us
								</Link>
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
