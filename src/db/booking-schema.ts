import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

import { bookingStatuses, paymentStatuses } from '@/lib/booking/booking-status';
import { newId, newPublicId } from '@/utils/ids';

import { user } from './auth-schema';
import { cancellationPolicies } from './policy-schema';
import { room } from './room-schema';

// Main booking/reservation table
export const bookings = sqliteTable(
	'bookings',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		// Public id used in URLs (/account/booking/$publicId etc.).
		publicId: text('public_id').notNull().unique().$defaultFn(newPublicId),
		confirmationId: text('confirmation_id').notNull().unique(),

		// Relationships
		userId: text('user_id') // Better Auth user ID
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		roomId: text('room_id')
			.notNull()
			.references(() => room.id, { onDelete: 'cascade' }),

		// Core booking data. Stay dates are property-local YYYY-MM-DD; the
		// normalized instants (UTC seconds) are check-in at 4:00 PM CT and
		// check-out at 11:00 AM CT on those dates (src/lib/booking/stay-times.ts).
		checkInDate: text('check_in_date').notNull(),
		checkOutDate: text('check_out_date').notNull(),
		checkInAt: integer('check_in_at', { mode: 'timestamp' }).notNull(),
		checkOutAt: integer('check_out_at', { mode: 'timestamp' }).notNull(),
		numberOfNights: integer('number_of_nights').notNull(),
		numberOfGuests: integer('number_of_guests').notNull(),

		// Detailed pricing breakdown (for accounting)
		baseAmount: real('base_amount').notNull(),
		taxAmount: real('tax_amount').default(0),
		feesAmount: real('fees_amount').default(0),
		// Reserved for discounts (e.g. Checkout promotion codes); not set yet.
		discountAmount: real('discount_amount').default(0),
		totalAmount: real('total_amount').notNull(),
		// Hotel occupancy tax snapshot, written when the booking is created
		// (dollars; rates as fractions). Null on bookings made before the
		// snapshot existed: the tax report estimates those from the room's
		// current rates (docs/TAX_REPORTING.md).
		taxableAmount: real('taxable_amount'),
		stateTaxRate: real('state_tax_rate'),
		cityTaxRate: real('city_tax_rate'),
		stateTaxAmount: real('state_tax_amount'),
		cityTaxAmount: real('city_tax_amount'),

		// Status (src/lib/booking/booking-status.ts). Stay timing is derived.
		status: text('status', { enum: bookingStatuses })
			.notNull()
			.default('pending'),
		paymentStatus: text('payment_status', { enum: paymentStatuses })
			.notNull()
			.default('pending'),

		// Guest contact (essential for communication)
		guestName: text('guest_name').notNull(),
		guestEmail: text('guest_email').notNull(),
		guestPhone: text('guest_phone'),

		// Admin and customer service
		specialRequests: text('special_requests'),
		internalNotes: text('internal_notes'), // Admin-only notes

		// Stripe integration
		stripeCustomerId: text('stripe_customer_id'),
		// The hold's current Checkout Session (one open session per hold).
		stripeSessionId: text('stripe_session_id'),
		// Set on confirmation (or when a delayed payment starts processing).
		stripePaymentIntentId: text('stripe_payment_intent_id'),

		// Timestamps (essential for admin dashboard)
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),

		// Cancellation & refund
		// Policy the booking was made under (null: the built-in default).
		cancellationPolicyId: text('cancellation_policy_id').references(
			() => cancellationPolicies.id,
			{ onDelete: 'set null' },
		),
		cancelledBy: text('cancelled_by'), // guest, admin, system
		// guest_request, admin, dates_unavailable, payment_failed, ...
		cancellationReason: text('cancellation_reason'),
		refundAmount: real('refund_amount'), // dollars refunded (0 if none)
		// Dollars of a cancellation refund not yet created in Stripe (set with
		// refund_pending, cleared when the refund exists or failed). The
		// payment recovery cron retries it with this exact amount.
		pendingRefundAmount: real('pending_refund_amount'),
		// The cancellation tier applied when the booking was cancelled.
		cancellationRefundPercent: integer('cancellation_refund_percent'),
		cancellationCutoffAt: integer('cancellation_cutoff_at', {
			mode: 'timestamp',
		}),
		stripeRefundId: text('stripe_refund_id'),
		// Hold expiry for pending bookings; the Checkout Session expires at the
		// same moment (HOLD_MINUTES).
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
	},
	(table) => [
		index('bookings_room_id_idx').on(table.roomId),
		index('bookings_status_idx').on(table.status),
		index('bookings_check_in_date_idx').on(table.checkInDate),
		// Stay-phase filters (upcoming / in stay / past).
		index('bookings_status_check_in_at_idx').on(table.status, table.checkInAt),
		index('bookings_created_at_idx').on(table.createdAt),
		index('bookings_expires_at_idx').on(table.expiresAt), // Index for efficient cleanup queries
		index('bookings_payment_intent_idx').on(table.stripePaymentIntentId),
		index('bookings_session_idx').on(table.stripeSessionId),
		// Availability / overlap lookups.
		index('bookings_room_status_dates_idx').on(
			table.roomId,
			table.status,
			table.checkInDate,
			table.checkOutDate,
		),
	],
);

// One row per paid booking (the Checkout Session's PaymentIntent and charge).
export const paymentTransactions = sqliteTable(
	'payment_transactions',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),

		// Essential Stripe data
		stripeCheckoutSessionId: text('stripe_checkout_session_id'),
		stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
		// The charge (PaymentIntent latest_charge): disputes and refunds
		// reference it, so they can be matched without a Stripe call.
		stripeChargeId: text('stripe_charge_id'),
		stripeCustomerId: text('stripe_customer_id'), // For customer tracking
		amount: real('amount').notNull(),
		// Dollars refunded so far (charge.amount_refunded).
		amountRefunded: real('amount_refunded').notNull().default(0),
		// Mirrors the booking's payment status once paid.
		status: text('status', { enum: paymentStatuses }).notNull(),

		// Payment method info (useful for admin)
		paymentMethod: text('payment_method'), // card, link, us_bank_account, ...

		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		index('payment_transactions_booking_idx').on(table.bookingId),
		index('payment_transactions_charge_idx').on(table.stripeChargeId),
	],
);

// Every Stripe refund on a booking's payment: the ones the app makes
// (cancellations, automatic refunds; source 'app') and the ones made in the
// Stripe Dashboard (source 'dashboard'). Upserted by the refund webhooks,
// which compare the stored status to decide what is new.
export const paymentRefunds = sqliteTable(
	'payment_refunds',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		stripeRefundId: text('stripe_refund_id').notNull().unique(),
		bookingId: text('booking_id').references(() => bookings.id, {
			onDelete: 'set null',
		}),
		stripePaymentIntentId: text('stripe_payment_intent_id'),
		stripeChargeId: text('stripe_charge_id'),
		source: text('source', { enum: ['app', 'dashboard'] }).notNull(),
		amount: real('amount').notNull(), // dollars
		currency: text('currency').notNull(),
		// pending, requires_action, succeeded, failed, canceled
		status: text('status').notNull(),
		// requested_by_customer, duplicate, fraudulent, expired_uncaptured_charge, ...
		reason: text('reason'),
		failureReason: text('failure_reason'),
		// Card network trace reference (ARN), once Stripe has it.
		reference: text('reference'),
		stripeCreatedAt: integer('stripe_created_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [index('payment_refunds_booking_idx').on(table.bookingId)],
);

// Stripe disputes (chargebacks), stored from the charge.dispute.* webhooks
// and linked to the booking and the guest when the payment is ours. Kept as
// a financial record: deleting its admin notification leaves it here.
export const paymentDisputes = sqliteTable(
	'payment_disputes',
	{
		id: text('id').primaryKey().$defaultFn(newId),
		stripeDisputeId: text('stripe_dispute_id').notNull().unique(),
		stripeChargeId: text('stripe_charge_id').notNull(),
		stripePaymentIntentId: text('stripe_payment_intent_id'),
		// Null when the payment matches no booking ("unlinked payment").
		bookingId: text('booking_id').references(() => bookings.id, {
			onDelete: 'set null',
		}),
		userId: text('user_id').references(() => user.id, {
			onDelete: 'set null',
		}),
		amount: real('amount').notNull(), // dollars
		currency: text('currency').notNull(),
		// fraudulent, product_not_received, duplicate, ...
		reason: text('reason').notNull(),
		// warning_needs_response, warning_under_review, warning_closed,
		// needs_response, under_review, won, lost, prevented
		status: text('status').notNull(),
		networkReasonCode: text('network_reason_code'),
		evidenceDueBy: integer('evidence_due_by', { mode: 'timestamp' }),
		isChargeRefundable: integer('is_charge_refundable', {
			mode: 'boolean',
		}).notNull(),
		livemode: integer('livemode', { mode: 'boolean' }).notNull(),
		cardBrand: text('card_brand'),
		cardLast4: text('card_last4'),
		stripeCreatedAt: integer('stripe_created_at', {
			mode: 'timestamp',
		}).notNull(),
		closedAt: integer('closed_at', { mode: 'timestamp' }),
		fundsWithdrawnAt: integer('funds_withdrawn_at', { mode: 'timestamp' }),
		fundsReinstatedAt: integer('funds_reinstated_at', { mode: 'timestamp' }),
		// The newest Stripe event applied. Replays and older (out-of-order)
		// events change nothing and do not resurface the notification.
		lastStripeEventId: text('last_stripe_event_id').notNull(),
		lastStripeEventCreated: integer('last_stripe_event_created', {
			mode: 'timestamp',
		}).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => [
		index('payment_disputes_booking_idx').on(table.bookingId),
		index('payment_disputes_user_idx').on(table.userId),
		index('payment_disputes_status_due_idx').on(
			table.status,
			table.evidenceDueBy,
		),
	],
);
