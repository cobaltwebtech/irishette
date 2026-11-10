import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
	ACCOUNT_BOOKING_COLUMNS,
	BookingsTable,
	byCheckIn,
} from '@/components/booking/BookingsTable';
import { BookingSummaryList } from '@/components/booking/BookingSummaryList';
import { EditProfileModal } from '@/components/EditProfileModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatDateCT } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

type BookingRow = RouterOutputs['bookings']['getMyBookings'][number];

const MY_BOOKINGS_INPUT = { limit: 50, offset: 0 };

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

	// By the server's stay phase (property time), not the browser's clock.
	const notPast = (row: BookingRow) => row.booking.stayPhase !== 'past';
	const bookings = allBookings.filter(
		(row) => row.booking.status === 'confirmed' && notPast(row),
	);
	const awaitingPayment = allBookings.filter(
		(row) => row.booking.status === 'pending',
	);
	const cancelled = allBookings.filter(
		(row) => row.booking.status === 'cancelled' && notPast(row),
	);

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
					<BookingsTable
						data={bookings}
						columns={ACCOUNT_BOOKING_COLUMNS}
						initialState={byCheckIn(false)}
						title="Current & Upcoming Bookings"
						description="Your current and upcoming confirmed bookings. Click on the confirmation ID to view more details."
						searchPlaceholder="Search bookings..."
						searchClassName="w-[250px]"
						headerClassName="flex flex-wrap items-center justify-between gap-2"
						emptyMessage="No bookings found."
						noun="bookings"
						className="mb-8"
						footer={
							<Link
								to="/account/past-bookings"
								data-slot="button"
								className={cn(buttonVariants({ variant: 'outline' }))}
							>
								<Icon icon="tabler:calendar-repeat" className="size-5" />
								View Past Bookings
							</Link>
						}
					/>
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

				<BookingSummaryList
					className="mb-8"
					title="Awaiting Payment"
					description="Bookings whose payment has not completed. A bank payment that is processing keeps your dates until it completes; an unpaid hold is released when it expires."
					rows={awaitingPayment}
				/>
				<BookingSummaryList
					className="mb-8"
					title="Cancelled Bookings"
					description="Upcoming stays that were cancelled. Refunds go back to the original payment method within 5-10 business days."
					rows={cancelled}
				/>

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
										{formatDateCT(user.createdAt, 'long')}
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
