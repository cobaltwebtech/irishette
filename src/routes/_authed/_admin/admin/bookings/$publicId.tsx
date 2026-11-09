import { Icon } from '@iconify/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { BookingInternalNotes } from '@/components/admin/BookingInternalNotes';
import { DisputesPanel } from '@/components/admin/DisputesPanel';
import { NotificationsPanel } from '@/components/admin/inbox/NotificationsPanel';
import { CancelBookingButton } from '@/components/booking/CancelBookingButton';
import {
	BookingDetailHeader,
	BookingGuestCard,
	BookingPaymentCard,
	BookingStayCard,
	DetailField,
	SpecialRequestsCard,
} from '@/components/booking/detail/BookingDetailCards';
import { useResendConfirmationEmail } from '@/components/booking/detail/use-resend-confirmation-email';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatDateTimeCT } from '@/lib/timezone';
import { cn } from '@/utils/twMerge';

type AdminBooking = RouterOutputs['bookings']['adminGetBooking'];

export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/$publicId',
)({
	head: () => ({
		meta: [
			{
				title: 'Admin Booking Details | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. The booking is preloaded for SSR; the guest
	// details (repeat-guest badge) depend on the booking's user publicId.
	loader: async ({ context, params }) => {
		const booking = await orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.bookings.adminGetBooking.queryOptions({
					publicId: params.publicId,
				}),
			),
		);
		if (booking.user) {
			// prefetchQuery never throws: guest details are optional here, a
			// failure only hides the repeat-guest badge (as before).
			await context.queryClient.prefetchQuery(
				context.trpc.users.adminGetGuestDetails.queryOptions({
					publicId: booking.user.publicId,
				}),
			);
		}
	},
	notFoundComponent: BookingNotFound,
	component: AdminBookingDetailPage,
});

function BookingNotFound() {
	return (
		<AdminLayout title="Booking Not Found">
			<Card>
				<CardHeader>
					<CardTitle>Booking Not Found</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-muted-foreground">
						The booking you're looking for could not be found.
					</p>
					<Link to="/admin/bookings/current-bookings">
						<Button>Back to Bookings</Button>
					</Link>
				</CardContent>
			</Card>
		</AdminLayout>
	);
}

function AdminBookingDetailPage() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();

	const { data } = useSuspenseQuery(
		trpc.bookings.adminGetBooking.queryOptions({ publicId }),
	);
	const { booking, room } = data;

	// Guest details for the repeat-guest badge (`user` is null only if the
	// account was deleted), hence `enabled`.
	const guestPublicId = data.user?.publicId;
	const { data: guestData } = useQuery(
		trpc.users.adminGetGuestDetails.queryOptions(
			{ publicId: guestPublicId ?? '' },
			{ enabled: !!guestPublicId },
		),
	);

	const bookingCount = guestData?.bookings?.length || 0;

	return (
		<AdminLayout title="Booking Details">
			{/* Header */}
			<div className="container mx-auto px-4 py-6">
				<BookingDetailHeader
					back={
						<Link
							to="/admin/bookings/current-bookings"
							data-slot="button"
							className={cn(buttonVariants({ variant: 'outline' }))}
						>
							← Back to Bookings
						</Link>
					}
					title={
						<>
							Booking -{' '}
							<span className="font-mono tracking-wider">
								{booking.confirmationId}
							</span>
						</>
					}
					status={booking.status}
				/>
			</div>

			{/* Main Content */}
			<div className="grid gap-8 lg:grid-cols-6">
				<BookingStayCard
					title="Booking Details"
					booking={booking}
					roomName={room.name}
				/>
				<BookingPaymentCard booking={booking} showPaymentStatus />

				<BookingGuestCard
					className="lg:col-span-4"
					guestName={booking.guestName}
					guestEmail={booking.guestEmail}
					badge={
						bookingCount > 1 && (
							<Badge className="bg-accent-4 text-xs">
								<Icon
									icon="tabler:star-filled"
									className="size-4 text-accent"
								/>
								Repeat Guest
							</Badge>
						)
					}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<DetailField
							label="Account Email"
							value={data.user?.email || 'N/A'}
						/>
						{booking.guestPhone && (
							<DetailField label="Phone" value={booking.guestPhone} />
						)}
					</div>
				</BookingGuestCard>

				<AdminActionsCard booking={booking} />

				<SpecialRequestsCard
					className="lg:col-span-3"
					specialRequests={booking.specialRequests}
					emptyText="No special requests provided by guest"
				/>

				{/* Internal Notes (admin only) */}
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Internal Notes</CardTitle>
						<CardDescription>
							Add or edit internal notes for this booking. These notes are only
							visible to admin users and not shown to the guest.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BookingInternalNotes
							bookingId={booking.id}
							currentNotes={booking.internalNotes || ''}
						/>
					</CardContent>
				</Card>

				<DisputesPanel className="lg:col-span-full" disputes={data.disputes} />

				<NotificationsPanel
					className="lg:col-span-full"
					bookingPublicId={booking.publicId}
				/>

				<AdminInfoCard booking={booking} userPublicId={data.user?.publicId} />
			</div>
		</AdminLayout>
	);
}

/** Stripe link, resend confirmation and cancel (admin only). */
function AdminActionsCard({ booking }: { booking: AdminBooking['booking'] }) {
	// Admin can resend for any booking.
	const resendEmail = useResendConfirmationEmail(
		'Confirmation email has been sent to the guest.',
	);
	const isResendingEmail = resendEmail.isPending;

	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle>Booking Actions</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{booking.stripePaymentIntentId && (
					<a
						href={`https://dashboard.stripe.com/acct_1RwOD0B1s28979kR/payments/${booking.stripePaymentIntentId}`}
						target="_blank"
						rel="noopener noreferrer"
						data-slot="button"
						className={cn(
							buttonVariants(),
							'h-auto w-full',
							'inline-flex items-center',
						)}
					>
						<Icon icon="tabler:external-link" className="size-6" />
						<span className="text-center text-wrap">
							View Payment at Stripe
						</span>
					</a>
				)}
				<Button
					onClick={() => resendEmail.mutate({ publicId: booking.publicId })}
					disabled={isResendingEmail}
					variant="secondary"
					className="h-auto w-full"
				>
					<Icon icon="tabler:mail-forward" className="size-6" />
					<span className="text-wrap">
						{isResendingEmail ? 'Sending...' : 'Resend Confirmation Email'}
					</span>
				</Button>
				{booking.status !== 'cancelled' && (
					<CancelBookingButton publicId={booking.publicId} mode="admin" />
				)}
			</CardContent>
		</Card>
	);
}

function MonoField({ label, value }: { label: string; value: string | null }) {
	return (
		<DetailField label={label}>
			<p className="font-mono text-sm">{value}</p>
		</DetailField>
	);
}

/** Internal ids, timestamps and Stripe ids (admin only). */
function AdminInfoCard({
	booking,
	userPublicId,
}: {
	booking: AdminBooking['booking'];
	userPublicId: string | undefined;
}) {
	return (
		<Card className="lg:col-span-full">
			<CardHeader>
				<CardTitle>Admin Information</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2">
					<MonoField label="Internal Booking ID" value={booking.id} />
					<MonoField label="User ID" value={userPublicId ?? 'N/A'} />
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<MonoField
						label="Created At"
						value={formatDateTimeCT(booking.createdAt)}
					/>
					<MonoField
						label="Updated At"
						value={formatDateTimeCT(booking.updatedAt)}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<MonoField
						label="Stripe Customer ID"
						value={booking.stripeCustomerId}
					/>
					{booking.stripePaymentIntentId && (
						<MonoField
							label="Stripe Payment Intent ID"
							value={booking.stripePaymentIntentId}
						/>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
