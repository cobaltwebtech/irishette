import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
	contactReplyHref,
	type InboxDetails,
	type InboxDetailsByKind,
	type InboxKind,
	stripePaymentUrl,
} from '@/lib/inbox';

// The body of one notification, by kind (src/lib/inbox.ts). Guest-typed text
// (contact form) is shown as plain text; React escapes it.

interface Item {
	kind: InboxKind;
	details: InboxDetails;
}

/** One view per kind; the type makes a new kind fail to compile until added. */
type KindViews = {
	[K in InboxKind]: (props: { details: InboxDetailsByKind[K] }) => ReactNode;
};

const currency = (amount: number, code = 'usd') =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: code.toUpperCase(),
	}).format(amount);

function DetailList({
	rows,
}: {
	/** Falsy entries are skipped (optional fields). */
	rows: Array<{ label: string; value: ReactNode } | false | null | ''>;
}) {
	return (
		<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
			{rows.map((row) => {
				if (!row) return null;
				const { label, value } = row;
				return (
					<div key={label} className="contents">
						<dt className="font-medium text-muted-foreground">{label}</dt>
						<dd className="break-words sm:col-span-2">{value}</dd>
					</div>
				);
			})}
		</dl>
	);
}

function ExternalLink({
	href,
	children,
}: {
	href: string;
	children: ReactNode;
}) {
	return (
		<Button asChild variant="outline" size="sm">
			<a href={href} target="_blank" rel="noreferrer noopener">
				{children}
				<Icon icon="tabler:external-link" className="size-4" />
			</a>
		</Button>
	);
}

function Actions({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap gap-2 pt-2">{children}</div>;
}

function BookingLink({ publicId, label }: { publicId: string; label: string }) {
	return (
		<Link
			to="/admin/bookings/$publicId"
			params={{ publicId }}
			className="font-mono text-primary hover:underline"
		>
			{label}
		</Link>
	);
}

function ContactFormView({
	details: d,
}: {
	details: InboxDetailsByKind['contact_form'];
}) {
	return (
		<div className="space-y-4">
			<DetailList
				rows={[
					{ label: 'From', value: d.name },
					{
						label: 'Email',
						value: (
							<a
								href={`mailto:${d.email}`}
								className="text-primary hover:underline"
							>
								{d.email}
							</a>
						),
					},
					d.phone && { label: 'Phone', value: d.phone },
					d.bookingConfirmationId && {
						label: 'Booking ID (as typed)',
						value: <span className="font-mono">{d.bookingConfirmationId}</span>,
					},
					{ label: 'Subject', value: d.subject },
				]}
			/>
			<div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
				{d.message}
			</div>
			<p className="text-xs text-muted-foreground">
				Sent through the contact form. The details are as the guest typed them
				and are not verified.
			</p>
			<Actions>
				<Button asChild>
					<a href={contactReplyHref(d)}>
						<Icon icon="tabler:arrow-back-up" className="size-4" />
						Reply by email
					</a>
				</Button>
			</Actions>
		</div>
	);
}

function RefundAutoView({
	details: d,
}: {
	details: InboxDetailsByKind['refund_auto'];
}) {
	return (
		<div className="space-y-4">
			<DetailList
				rows={[
					{ label: 'Confirmation', value: d.confirmationId },
					{ label: 'Room', value: d.roomName },
					{
						label: 'Dates',
						value: `${d.checkInDate} to ${d.checkOutDate}`,
					},
					{ label: 'Refunded', value: currency(d.amount) },
					{ label: 'Refund', value: d.refundId },
				]}
			/>
			<p className="text-sm text-muted-foreground">
				Check the calendar for double bookings on other platforms.
			</p>
			<Actions>
				<ExternalLink href={stripePaymentUrl(d.paymentIntentId, d.livemode)}>
					Open payment in Stripe
				</ExternalLink>
			</Actions>
		</div>
	);
}

function RefundFailedView({
	details: d,
}: {
	details: InboxDetailsByKind['refund_failed'];
}) {
	return (
		<div className="space-y-4">
			<DetailList
				rows={[
					d.confirmationId && {
						label: 'Confirmation',
						value: d.confirmationId,
					},
					{
						label: 'Amount',
						value: currency(d.amount, d.currency),
					},
					{
						label: 'Reason',
						value: d.failureReason ?? 'Not given',
					},
					{ label: 'Refund', value: d.refundId },
				]}
			/>
			<p className="text-sm text-muted-foreground">
				Stripe could not complete this refund. Check the payment in Stripe and
				contact the guest.
			</p>
			{d.paymentIntentId && (
				<Actions>
					<ExternalLink href={stripePaymentUrl(d.paymentIntentId, d.livemode)}>
						Open payment in Stripe
					</ExternalLink>
				</Actions>
			)}
		</div>
	);
}

function SyncFailedView({
	details: d,
}: {
	details: InboxDetailsByKind['ical_sync_failed'];
}) {
	return (
		<div className="space-y-4">
			<DetailList
				rows={[
					{ label: 'Room', value: d.roomName },
					{
						label: 'Feed',
						value: d.feedLabel ?? d.feedSource,
					},
					{ label: 'Problem', value: d.problem },
				]}
			/>
			<p className="text-sm text-muted-foreground">
				The latest import was not applied, so the stored reservations from this
				feed were left unchanged. Check the feed URL on the platform and use
				"Sync now" once it is fixed.
			</p>
			<RoomCalendarAction roomPublicId={d.roomPublicId} />
		</div>
	);
}

function ConflictView({
	details: d,
}: {
	details: InboxDetailsByKind['ical_conflict'];
}) {
	return (
		<div className="space-y-4">
			<DetailList
				rows={[
					{ label: 'Room', value: d.roomName },
					{
						label: 'Feed',
						value: d.feedLabel ?? d.feedSource,
					},
				]}
			/>
			<ul className="space-y-2 text-sm">
				{d.conflicts.map((c) => (
					<li
						key={`${c.bookingPublicId}:${c.eventStart}:${c.eventEnd}`}
						className="rounded-md border p-3"
					>
						{d.feedSource} {c.eventStart} to {c.eventEnd} overlaps{' '}
						<BookingLink
							publicId={c.bookingPublicId}
							label={c.confirmationId}
						/>{' '}
						({c.checkInDate} to {c.checkOutDate}, {c.bookingStatus})
					</li>
				))}
			</ul>
			<p className="text-sm text-muted-foreground">
				Resolve it on the platform or with the guest.
			</p>
			<RoomCalendarAction roomPublicId={d.roomPublicId} />
		</div>
	);
}

const VIEWS: KindViews = {
	contact_form: ContactFormView,
	refund_auto: RefundAutoView,
	refund_failed: RefundFailedView,
	ical_sync_failed: SyncFailedView,
	ical_conflict: ConflictView,
};

export function InboxItemDetails({ item }: { item: Item }) {
	const View = VIEWS[item.kind] as (props: {
		details: InboxDetails;
	}) => ReactNode;
	return <View details={item.details} />;
}

function RoomCalendarAction({ roomPublicId }: { roomPublicId: string }) {
	if (!roomPublicId) return null;
	return (
		<Actions>
			<Button asChild variant="outline" size="sm">
				<Link
					to="/admin/property-management/$publicId"
					params={{ publicId: roomPublicId }}
				>
					<Icon icon="tabler:calendar-cog" className="size-4" />
					Open calendar settings
				</Link>
			</Button>
		</Actions>
	);
}
