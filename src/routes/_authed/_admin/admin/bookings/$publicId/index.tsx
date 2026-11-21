import { Icon } from '@iconify/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { PaymentsAndChangesCard } from '@/components/admin/booking/PaymentsAndChangesCard';
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
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatDateTimeCT } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

type AdminBooking = RouterOutputs['bookings']['adminGetBooking'];

// The booking is loaded by the layout route ($publicId.tsx), which also
// renders the not-found page; the modify page is its sibling child.
export const Route = createFileRoute(
	'/_authed/_admin/admin/bookings/$publicId/',
)({
	component: AdminBookingDetailPage,
});

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

				<PaymentsAndChangesCard
					className="lg:col-span-full"
					payments={data.paymentTransactions}
					refunds={data.paymentRefunds}
					modifications={data.bookingModifications}
				/>

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
						href={`https://dashboard.stripe.com/payments/${booking.stripePaymentIntentId}`}
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
				{booking.status === 'confirmed' &&
					(booking.paymentStatus === 'paid' ||
						booking.paymentStatus === 'partially_refunded') && (
						<Link
							to="/admin/bookings/$publicId/modify"
							params={{ publicId: booking.publicId }}
							className={cn(
								buttonVariants({ variant: 'outline' }),
								'h-auto w-full',
							)}
						>
							<Icon icon="tabler:calendar-cog" className="size-6" />
							<span className="text-wrap">Modify Reservation</span>
						</Link>
					)}
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
