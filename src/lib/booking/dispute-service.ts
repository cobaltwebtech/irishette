import { type AnyColumn, and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import {
	bookings,
	paymentDisputes,
	paymentTransactions,
} from '@/db/schema-export';
import { createInboxItem, type NewInboxItem } from '@/lib/inbox/inbox-service';
import type { ServiceDeps } from '@/lib/server/deps';
import { stripeId } from '@/lib/stripe/stripe';
import { formatMoney } from '@/utils/format';
import { formatInstantCT } from '@/utils/timezone';

// Stripe disputes (chargebacks) from the charge.dispute.* webhooks
// (plan 02, 3.4b). Each dispute is stored once (upsert by its Stripe id) and
// linked to the booking and the guest when the payment is ours. Every newer
// Stripe event marks its admin notification unread again; replays and
// out-of-order older events change nothing. No email: Stripe already emails
// the account owner. Server-only.

/** Dispute statuses after which nothing is pending any more. */
export const CLOSED_DISPUTE_STATUSES = [
	'won',
	'lost',
	'warning_closed',
	'prevented',
] as const;

/** True while a booking's payment has a dispute that is not closed. */
export async function hasOpenDispute(db: Database, bookingId: string) {
	const [row] = await db
		.select({ id: paymentDisputes.id })
		.from(paymentDisputes)
		.where(
			and(
				eq(paymentDisputes.bookingId, bookingId),
				notInArray(paymentDisputes.status, [...CLOSED_DISPUTE_STATUSES]),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** SQL: the booking row has an open dispute (admin lists' badge). */
export const openDisputeExists = sql<boolean>`EXISTS (
	SELECT 1 FROM payment_disputes AS d
	WHERE d.booking_id = ${bookings.id}
		AND d.status NOT IN ('won', 'lost', 'warning_closed', 'prevented')
)`;

/** Admin panel fields (no internal ids). */
export const disputePanelColumns = {
	stripeDisputeId: paymentDisputes.stripeDisputeId,
	amount: paymentDisputes.amount,
	currency: paymentDisputes.currency,
	reason: paymentDisputes.reason,
	status: paymentDisputes.status,
	evidenceDueBy: paymentDisputes.evidenceDueBy,
	cardBrand: paymentDisputes.cardBrand,
	cardLast4: paymentDisputes.cardLast4,
	livemode: paymentDisputes.livemode,
	stripeCreatedAt: paymentDisputes.stripeCreatedAt,
	closedAt: paymentDisputes.closedAt,
	fundsWithdrawnAt: paymentDisputes.fundsWithdrawnAt,
	fundsReinstatedAt: paymentDisputes.fundsReinstatedAt,
	bookingPublicId: bookings.publicId,
	confirmationId: bookings.confirmationId,
};

/** Disputes for one booking or one guest, newest first (admin pages). */
export function listDisputes(
	db: Database,
	where: { bookingId: string } | { userId: string },
) {
	return db
		.select(disputePanelColumns)
		.from(paymentDisputes)
		.leftJoin(bookings, eq(paymentDisputes.bookingId, bookings.id))
		.where(
			'bookingId' in where
				? eq(paymentDisputes.bookingId, where.bookingId)
				: eq(paymentDisputes.userId, where.userId),
		)
		.orderBy(desc(paymentDisputes.stripeCreatedAt))
		.limit(20);
}

type DisputeEventType =
	| 'charge.dispute.created'
	| 'charge.dispute.updated'
	| 'charge.dispute.closed'
	| 'charge.dispute.funds_withdrawn'
	| 'charge.dispute.funds_reinstated';

interface LinkedBooking {
	id: string;
	userId: string;
	confirmationId: string;
	publicId: string;
}

/**
 * The booking a disputed payment belongs to: the PaymentIntent's
 * `metadata.bookingId` (one Stripe call), then our stored charge and
 * PaymentIntent ids. Also returns the card brand and last 4.
 */
async function linkDispute(deps: ServiceDeps, dispute: Stripe.Dispute) {
	const chargeId = stripeId(dispute.charge) ?? '';
	const fromCharge = await chargeDetails(deps, dispute, chargeId);
	const intentId = fromCharge.intentId ?? stripeId(dispute.payment_intent);
	const booking =
		(await bookingById(deps.db, fromCharge.metadataBookingId)) ??
		(await bookingByCharge(deps.db, chargeId)) ??
		(await bookingByIntent(deps.db, intentId));
	return { chargeId, intentId, booking, card: fromCharge.card };
}

/** The charge's PaymentIntent (metadata) and card; empty if Stripe fails. */
async function chargeDetails(
	deps: ServiceDeps,
	dispute: Stripe.Dispute,
	chargeId: string,
) {
	const brand = dispute.payment_method_details?.card?.brand ?? null;
	try {
		const charge = await deps.stripe.charges.retrieve(chargeId, {
			expand: ['payment_intent'],
		});
		const pi =
			typeof charge.payment_intent === 'object' ? charge.payment_intent : null;
		const card = charge.payment_method_details?.card;
		return {
			intentId: pi?.id ?? null,
			metadataBookingId: pi?.metadata?.bookingId,
			card: { brand: card?.brand ?? brand, last4: card?.last4 ?? null },
		};
	} catch (error) {
		// Link from our own records instead.
		console.warn(
			`Dispute ${dispute.id}: charge lookup failed:`,
			error instanceof Error ? error.message : 'Unknown error',
		);
		return {
			intentId: null,
			metadataBookingId: undefined,
			card: { brand, last4: null },
		};
	}
}

const linkColumns = {
	id: bookings.id,
	userId: bookings.userId,
	confirmationId: bookings.confirmationId,
	publicId: bookings.publicId,
};

async function bookingById(
	db: Database,
	id: string | undefined,
): Promise<LinkedBooking | undefined> {
	if (!id) return undefined;
	const [row] = await db
		.select(linkColumns)
		.from(bookings)
		.where(eq(bookings.id, id));
	return row;
}

async function bookingByCharge(
	db: Database,
	chargeId: string,
): Promise<LinkedBooking | undefined> {
	if (!chargeId) return undefined;
	const [row] = await db
		.select(linkColumns)
		.from(paymentTransactions)
		.innerJoin(bookings, eq(paymentTransactions.bookingId, bookings.id))
		.where(eq(paymentTransactions.stripeChargeId, chargeId));
	return row;
}

async function bookingByIntent(
	db: Database,
	intentId: string | null,
): Promise<LinkedBooking | undefined> {
	if (!intentId) return undefined;
	const [row] = await db
		.select(linkColumns)
		.from(bookings)
		.where(eq(bookings.stripePaymentIntentId, intentId));
	return row;
}

const EVENT_LABELS: Record<DisputeEventType, string> = {
	'charge.dispute.created': 'Dispute opened',
	'charge.dispute.updated': 'Dispute updated',
	'charge.dispute.closed': 'Dispute closed',
	'charge.dispute.funds_withdrawn': 'Dispute funds withdrawn',
	'charge.dispute.funds_reinstated': 'Dispute funds reinstated',
};

const lower = (value: string) => value.replaceAll('_', ' ');

type DisputeLink = Awaited<ReturnType<typeof linkDispute>>;
type DisputeEvent = Stripe.Event & { type: DisputeEventType };

const isClosedStatus = (status: string) =>
	(CLOSED_DISPUTE_STATUSES as readonly string[]).includes(status);

/** The payment_disputes row for an event (insert values). */
function disputeRow(
	dispute: Stripe.Dispute,
	event: DisputeEvent,
	link: DisputeLink,
	now: Date,
) {
	const eventCreated = new Date(event.created * 1000);
	const dueBy = dispute.evidence_details?.due_by;
	const card = dispute.payment_method_details?.card;
	const at = (type: DisputeEventType) =>
		event.type === type ? eventCreated : null;
	return {
		stripeDisputeId: dispute.id,
		stripeChargeId: link.chargeId,
		stripePaymentIntentId: link.intentId,
		bookingId: link.booking?.id ?? null,
		userId: link.booking?.userId ?? null,
		amount: dispute.amount / 100,
		currency: dispute.currency,
		reason: dispute.reason,
		status: dispute.status,
		networkReasonCode:
			card?.network_reason_code ?? dispute.network_reason_code ?? null,
		evidenceDueBy: dueBy ? new Date(dueBy * 1000) : null,
		isChargeRefundable: dispute.is_charge_refundable,
		livemode: dispute.livemode,
		cardBrand: link.card.brand,
		cardLast4: link.card.last4,
		stripeCreatedAt: new Date(dispute.created * 1000),
		closedAt: isClosedStatus(dispute.status) ? eventCreated : null,
		fundsWithdrawnAt: at('charge.dispute.funds_withdrawn'),
		fundsReinstatedAt: at('charge.dispute.funds_reinstated'),
		lastStripeEventId: event.id,
		lastStripeEventCreated: eventCreated,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Inserts the dispute, or updates it only if this event is newer than the
 * last one applied: a later event, or another event in the same second
 * (Stripe often sends created + funds_withdrawn together). A replay of the
 * last applied event or anything older changes nothing (no row returned).
 */
async function upsertDispute(
	db: Database,
	values: ReturnType<typeof disputeRow>,
) {
	const t = paymentDisputes;
	const created = Math.floor(values.lastStripeEventCreated.getTime() / 1000);
	const eventId = values.lastStripeEventId;
	const newer = sql`(${created} > ${t.lastStripeEventCreated} OR (${created} = ${t.lastStripeEventCreated} AND ${eventId} <> ${t.lastStripeEventId}))`;
	// Keep the stored value / prefer this event's value when it has one.
	const keep = (column: AnyColumn) =>
		sql`COALESCE(${column}, excluded.${sql.raw(column.name)})`;
	const latest = (column: AnyColumn) =>
		sql`COALESCE(excluded.${sql.raw(column.name)}, ${column})`;
	const [row] = await db
		.insert(t)
		.values(values)
		.onConflictDoUpdate({
			target: t.stripeDisputeId,
			set: {
				bookingId: keep(t.bookingId),
				userId: keep(t.userId),
				stripePaymentIntentId: latest(t.stripePaymentIntentId),
				amount: values.amount,
				currency: values.currency,
				reason: values.reason,
				status: values.status,
				networkReasonCode: values.networkReasonCode,
				evidenceDueBy: values.evidenceDueBy,
				isChargeRefundable: values.isChargeRefundable,
				cardBrand: latest(t.cardBrand),
				cardLast4: latest(t.cardLast4),
				closedAt: values.closedAt ? keep(t.closedAt) : null,
				fundsWithdrawnAt: latest(t.fundsWithdrawnAt),
				fundsReinstatedAt: latest(t.fundsReinstatedAt),
				lastStripeEventId: values.lastStripeEventId,
				lastStripeEventCreated: values.lastStripeEventCreated,
				updatedAt: values.updatedAt,
			},
			setWhere: newer,
		})
		.returning({ id: t.id });
	return row;
}

/** The payment_dispute notification for the latest change. */
function disputeInboxItem(
	values: ReturnType<typeof disputeRow>,
	event: DisputeEvent,
	link: DisputeLink,
	disputeRowId: string,
): NewInboxItem<'payment_dispute'> {
	const { booking } = link;
	const closed = values.closedAt !== null;
	const label = booking?.confirmationId ?? 'unlinked payment';
	const amount = formatMoney(values.amount, values.currency);
	const due =
		values.evidenceDueBy && !closed
			? `, respond by ${formatInstantCT(values.evidenceDueBy)}`
			: '';
	return {
		kind: 'payment_dispute',
		title: closed
			? `Dispute ${lower(values.status)}: ${label}, ${amount}`
			: `Dispute: ${label}, ${amount}, ${lower(values.reason)}${due}`,
		summary: `${EVENT_LABELS[event.type]}: status ${lower(values.status)}, reason ${lower(values.reason)}.${booking ? '' : ' The payment matches no booking.'}`,
		details: {
			disputeId: values.stripeDisputeId,
			amount: values.amount,
			currency: values.currency,
			reason: values.reason,
			status: values.status,
			lastEvent: event.type,
			evidenceDueBy:
				values.evidenceDueBy && !closed
					? values.evidenceDueBy.toISOString()
					: null,
			paymentIntentId: link.intentId,
			chargeId: link.chargeId,
			confirmationId: booking?.confirmationId ?? null,
			livemode: values.livemode,
		},
		bookingId: booking?.id ?? null,
		userId: booking?.userId ?? null,
		paymentDisputeId: disputeRowId,
		dedupeKey: `dispute:${values.stripeDisputeId}`,
	};
}

/**
 * Stores a dispute event. Returns 'applied' when it was newer than the last
 * event applied (the notification resurfaces), 'stale' for a replay or an
 * older event (nothing changes).
 */
export async function handleDisputeEvent(
	deps: ServiceDeps,
	event: DisputeEvent,
	now = new Date(),
): Promise<'applied' | 'stale'> {
	const dispute = event.data.object as Stripe.Dispute;
	const link = await linkDispute(deps, dispute);
	const values = disputeRow(dispute, event, link, now);
	const row = await upsertDispute(deps.db, values);
	if (!row) {
		console.log(
			`Dispute ${dispute.id}: ${event.type} ${event.id} is not newer than the last event applied; ignored`,
		);
		return 'stale';
	}
	await createInboxItem(deps, disputeInboxItem(values, event, link, row.id), {
		resurfaceAfterSeconds: 0,
		now,
	});
	console.log(
		`Dispute ${dispute.id}: ${event.type} applied (${dispute.status})${link.booking ? ` for booking ${link.booking.confirmationId}` : ' (unlinked)'}`,
	);
	return 'applied';
}
