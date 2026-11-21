import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { Database } from '@/db/drizzle-init';
import {
	bookingModifications,
	bookings,
	paymentTransactions,
} from '@/db/schema-export';
import {
	sendAdminAlert,
	sendBookingModifiedEmails,
} from '@/lib/email/email-service';
import { createInboxItemInBackground } from '@/lib/inbox/inbox-service';
import { inBackground, type ServiceDeps } from '@/lib/server/deps';
import {
	isPermanentStripeError,
	stripeBookingMetadata,
	stripeId,
} from '@/lib/stripe/stripe';
import {
	BOOKING_WINDOW_MONTHS,
	daysBetween,
	type IsoDate,
	lastBookableDate,
	MAX_NIGHTS,
} from '@/utils/date-range';
import { formatMoney } from '@/utils/format';
import { newId } from '@/utils/ids';
import { todayIn } from '@/utils/timezone';

import { checkAvailability, noOverlapForStay } from './availability';
import { refundAcrossPayments } from './booking-payments';
import { assertRoomBookable, quoteStay } from './booking-service';
import {
	type Booking,
	cancelIntent,
	ensureStripeCustomer,
	loadBooking,
	paymentMethodFields,
	publicConflicts,
	roomName,
	sessionIntent,
} from './checkout-service';
import { hasOpenDispute } from './dispute-service';
import {
	changeError,
	differenceInCents,
	MODIFIABLE_PAYMENT_STATUSES,
	MODIFICATION_KIND_LABELS,
	type ModificationKind,
	type ModificationStatus,
	modifiableError,
	modificationKind,
	releaseEarlyError,
} from './modification-rules';
import { checkInAt, checkOutAt } from './stay-times';

// Admin-only reservation changes (plan 06): move dates, extend, change room
// (full reprice at today's rates; the difference is charged to the saved
// card or refunded) and release a room early (no money). Same safety order
// as new bookings: authorize the extra charge, claim the new dates in one
// guarded UPDATE, then capture; a claim that fails cancels the
// authorization. Refunds for a cheaper stay go out after the claim. Every
// change is logged in booking_modifications. Server-only.

export interface ModificationTarget {
	roomId: string;
	checkInDate: IsoDate;
	checkOutDate: IsoDate;
}

type Plan = Awaited<ReturnType<typeof planModification>>;

const bad = (message: string) =>
	new TRPCError({ code: 'BAD_REQUEST', message });

const changedMeanwhile = () =>
	new TRPCError({
		code: 'CONFLICT',
		message:
			'This booking or its dates changed meanwhile. Reload and review the change again.',
	});

/**
 * Checks a move, extension, shortening or room change and prices it: the
 * booking can be changed, the rules (any length before the stay begins;
 * once it has begun only a later check-out; 30 nights, 10 months), the room
 * takes the guests, the new dates are free (ignoring this booking) and the
 * full reprice at current rates.
 */
export async function planModification(
	deps: Pick<ServiceDeps, 'db'>,
	booking: Booking,
	target: ModificationTarget,
	now = new Date(),
) {
	const blocked = modifiableError(booking);
	if (blocked) throw bad(blocked);
	const today = todayIn(undefined, now);
	const current = {
		roomId: booking.roomId,
		checkIn: booking.checkInDate,
		checkOut: booking.checkOutDate,
	};
	const next = {
		roomId: target.roomId,
		checkIn: target.checkInDate,
		checkOut: target.checkOutDate,
	};
	const invalid = changeError(current, next, today, {
		stayBegun: now >= booking.checkInAt,
	});
	if (invalid) throw bad(invalid);
	if (daysBetween(next.checkIn, next.checkOut) > MAX_NIGHTS) {
		throw bad(`Stays can be at most ${MAX_NIGHTS} nights`);
	}
	if (next.checkOut > lastBookableDate(today)) {
		throw bad(
			`Bookings can be made up to ${BOOKING_WINDOW_MONTHS} months ahead`,
		);
	}
	if (next.roomId !== current.roomId) {
		await assertRoomBookable(deps.db, next.roomId, booking.numberOfGuests);
	}
	const availability = await checkAvailability(
		deps.db,
		next.roomId,
		next.checkIn,
		next.checkOut,
		{ excludeBookingId: booking.id, now },
	);
	if (!availability.available) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: 'The new dates are not available in this room.',
			cause: { conflicts: publicConflicts(availability.conflicts) },
		});
	}
	const price = await quoteStay(
		deps.db,
		next.roomId,
		next.checkIn,
		next.checkOut,
	);
	return {
		kind: modificationKind(current, next),
		current,
		next,
		price,
		differenceCents: differenceInCents(price.totalAmount, booking.totalAmount),
	};
}

/** The card a change can be charged to off-session, if there is one. */
export async function savedCard(deps: ServiceDeps, booking: Booking) {
	const [row] = await deps.db
		.select({
			paymentMethodId: paymentTransactions.stripePaymentMethodId,
			paymentMethod: paymentTransactions.paymentMethod,
			brand: paymentTransactions.cardBrand,
			last4: paymentTransactions.cardLast4,
		})
		.from(paymentTransactions)
		.where(
			and(
				eq(paymentTransactions.bookingId, booking.id),
				isNotNull(paymentTransactions.stripePaymentMethodId),
			),
		)
		.orderBy(desc(paymentTransactions.createdAt))
		.limit(1);
	const customer = booking.stripeCustomerId;
	if (row?.paymentMethodId && customer) {
		// Only a card is charged off-session (a Link method is not, plan 06).
		return row.paymentMethod === 'card'
			? {
					paymentMethodId: row.paymentMethodId,
					customer,
					brand: row.brand,
					last4: row.last4,
				}
			: null;
	}
	if (!booking.stripePaymentIntentId || !customer) return null;
	const intent = await deps.stripe.paymentIntents.retrieve(
		booking.stripePaymentIntentId,
		{ expand: ['payment_method'] },
	);
	const pm = intent.payment_method;
	if (!pm || typeof pm !== 'object' || pm.type !== 'card') return null;
	return {
		paymentMethodId: pm.id,
		customer,
		brand: pm.card?.brand ?? null,
		last4: pm.card?.last4 ?? null,
	};
}

type SavedCard = NonNullable<Awaited<ReturnType<typeof savedCard>>>;

export type ModifyResult =
	| {
			status: 'applied';
			modificationId: string;
			differenceCents: number;
			refundFailed: boolean;
	  }
	/** The saved card can't be charged: no booking change; enter a card. */
	| { status: 'card_required'; reason: string; differenceCents: number };

export interface ModifyInput {
	target: ModificationTarget;
	/** The difference the admin approved (drift check). */
	expectedDifferenceCents: number;
	note?: string;
	/** Refund although the payment has an open dispute (as cancellations). */
	confirmDisputeRefund?: boolean;
}

/** The price moved since the admin reviewed it: CONFLICT with the new one. */
function assertNoDrift(plan: Plan, expected: number) {
	if (plan.differenceCents === expected) return;
	throw new TRPCError({
		code: 'CONFLICT',
		message: `The price difference is now ${formatMoney(plan.differenceCents / 100)}. Review and confirm again.`,
		cause: { differenceCents: plan.differenceCents },
	});
}

async function assertDisputeAllowsRefund(
	db: Database,
	booking: Booking,
	plan: Plan,
	confirmed: boolean | undefined,
) {
	if (plan.differenceCents >= 0 || confirmed) return;
	if (await hasOpenDispute(db, booking.id)) {
		throw new TRPCError({
			code: 'CONFLICT',
			message:
				'This payment has an open dispute. Refunding the difference can credit the guest twice; confirm the refund explicitly.',
		});
	}
}

/**
 * Moves, extends or changes the room of a confirmed booking (admin). A
 * higher price is authorized on the saved card first (off-session); a
 * decline or a card that needs the guest returns 'card_required' with
 * nothing changed. Then the booking is claimed, the charge captured or the
 * refund created, and the change logged and emailed.
 */
export async function modifyBooking(
	deps: ServiceDeps,
	booking: Booking,
	input: ModifyInput,
	adminId: string,
	now = new Date(),
): Promise<ModifyResult> {
	const plan = await planModification(deps, booking, input.target, now);
	assertNoDrift(plan, input.expectedDifferenceCents);
	await assertDisputeAllowsRefund(
		deps.db,
		booking,
		plan,
		input.confirmDisputeRefund,
	);
	const modificationId = newId();
	const context = { modificationId, adminId, note: input.note ?? null };
	if (plan.differenceCents <= 0) {
		return applyModification(deps, booking, plan, context, now);
	}
	const card = await savedCard(deps, booking);
	if (!card) {
		return {
			status: 'card_required',
			reason: 'There is no saved card that can be charged for this booking.',
			differenceCents: plan.differenceCents,
		};
	}
	const authorized = await authorizeOffSession(
		deps,
		booking,
		plan,
		card,
		modificationId,
	);
	if ('declined' in authorized) {
		return {
			status: 'card_required',
			reason: authorized.declined,
			differenceCents: plan.differenceCents,
		};
	}
	return applyModification(
		deps,
		booking,
		plan,
		{ ...context, intent: authorized.intent, card },
		now,
	);
}

function modificationMetadata(
	booking: Booking,
	modificationId: string,
): Record<string, string> {
	return {
		...stripeBookingMetadata(booking),
		reason: 'modification',
		modificationId,
	};
}

/** Authorizes the difference on the saved card (manual capture). */
async function authorizeOffSession(
	deps: ServiceDeps,
	booking: Booking,
	plan: Plan,
	card: SavedCard,
	modificationId: string,
): Promise<{ intent: Stripe.PaymentIntent } | { declined: string }> {
	try {
		const intent = await deps.stripe.paymentIntents.create(
			{
				amount: plan.differenceCents,
				currency: 'usd',
				customer: card.customer,
				payment_method: card.paymentMethodId,
				// A saved card, confirmed now: no redirect is possible.
				automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
				off_session: true,
				confirm: true,
				capture_method: 'manual',
				metadata: modificationMetadata(booking, modificationId),
				description: `Irishette booking ${booking.confirmationId} change`,
			},
			{ idempotencyKey: `modify/${modificationId}` },
		);
		if (intent.status === 'requires_capture') return { intent };
		if (intent.status !== 'canceled' && intent.status !== 'succeeded') {
			await cancelIntent(deps.stripe, intent.id).catch(() => false);
		}
		return {
			declined:
				'The card on file needs the guest to confirm the payment. Enter a card instead.',
		};
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'type' in error &&
			(error as { type: string }).type === 'StripeCardError'
		) {
			return {
				declined: `The card on file was declined (${error instanceof Error ? error.message : 'card error'}). Enter a card instead.`,
			};
		}
		throw error;
	}
}

interface ApplyContext {
	modificationId: string;
	adminId: string | null;
	note: string | null;
	/** The authorized extra charge (increases). */
	intent?: Stripe.PaymentIntent;
	card?: Pick<SavedCard, 'brand' | 'last4'> | null;
}

/** The stay and price columns a change writes. */
function stayColumns(plan: Plan) {
	const { price, next } = plan;
	return {
		roomId: next.roomId,
		checkInDate: next.checkIn,
		checkOutDate: next.checkOut,
		checkInAt: checkInAt(next.checkIn),
		checkOutAt: checkOutAt(next.checkOut),
		numberOfNights: price.numberOfNights,
		baseAmount: price.baseAmount,
		feesAmount: price.feesAmount,
		taxAmount: price.taxAmount,
		totalAmount: price.totalAmount,
		taxableAmount: price.taxBreakdown.taxableAmount,
		stateTaxRate: price.taxBreakdown.stateTaxRate,
		cityTaxRate: price.taxBreakdown.cityTaxRate,
		stateTaxAmount: price.taxBreakdown.stateTaxAmount,
		cityTaxAmount: price.taxBreakdown.cityTaxAmount,
	};
}

/**
 * Claims the new stay in one guarded UPDATE (still confirmed and paid, not
 * changed since it was read, the NEW dates free), logs the change, then
 * captures the extra charge or refunds the difference. A claim that fails
 * cancels the authorization: the guest is never charged for a change that
 * did not happen. A retry of the same change finds it applied.
 */
async function applyModification(
	deps: ServiceDeps,
	booking: Booking,
	plan: Plan,
	context: ApplyContext,
	now: Date,
): Promise<Extract<ModifyResult, { status: 'applied' }>> {
	const { db } = deps;
	const { modificationId } = context;
	let current = booking;
	if (booking.lastModificationId !== modificationId) {
		const [row] = await db
			.update(bookings)
			.set({
				...stayColumns(plan),
				lastModificationId: modificationId,
				updatedAt: now,
			})
			.where(
				and(
					eq(bookings.id, booking.id),
					eq(bookings.status, 'confirmed'),
					inArray(bookings.paymentStatus, [...MODIFIABLE_PAYMENT_STATUSES]),
					eq(bookings.updatedAt, booking.updatedAt),
					noOverlapForStay(
						plan.next.roomId,
						plan.next.checkIn,
						plan.next.checkOut,
						booking.id,
						now,
					),
				),
			)
			.returning();
		if (!row) {
			if (context.intent) await cancelIntent(deps.stripe, context.intent.id);
			throw changedMeanwhile();
		}
		current = row;
	}

	const diff = plan.differenceCents;
	const status: ModificationStatus =
		diff > 0 ? 'payment_pending' : diff < 0 ? 'refund_pending' : 'applied';
	await db
		.insert(bookingModifications)
		.values({
			id: modificationId,
			bookingId: booking.id,
			adminUserId: context.adminId,
			kind: plan.kind,
			previousRoomId: plan.current.roomId,
			newRoomId: plan.next.roomId,
			previousCheckInDate: plan.current.checkIn,
			previousCheckOutDate: plan.current.checkOut,
			newCheckInDate: plan.next.checkIn,
			newCheckOutDate: plan.next.checkOut,
			previousTotal: booking.totalAmount,
			newTotal: plan.price.totalAmount,
			differenceCents: diff,
			stripePaymentIntentId: context.intent?.id ?? null,
			status,
			note: context.note,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	let refundFailed = false;
	if (diff > 0 && context.intent) {
		await finishModificationPayment(
			deps,
			current,
			modificationId,
			context.intent.id,
			context.card ?? null,
			now,
		);
	} else if (diff < 0) {
		refundFailed = await refundModification(
			deps,
			current,
			modificationId,
			-diff,
			now,
		);
	}
	await notifyModification(deps, current, modificationId, now);
	return {
		status: 'applied',
		modificationId,
		differenceCents: diff,
		refundFailed,
	};
}

/**
 * Captures a change's extra charge and records it as a payment. Transient
 * Stripe errors throw (the change stays payment_pending and the recovery
 * cron finishes it); a charge that can no longer be captured marks the
 * change payment_failed and alerts the admins.
 */
async function finishModificationPayment(
	deps: ServiceDeps,
	booking: Booking,
	modificationId: string,
	intentId: string,
	card: Pick<SavedCard, 'brand' | 'last4'> | null,
	now: Date,
) {
	const { db, stripe } = deps;
	let intent: Stripe.PaymentIntent;
	try {
		intent = await stripe.paymentIntents.capture(
			intentId,
			{},
			{ idempotencyKey: `capture-modify/${modificationId}` },
		);
	} catch (error) {
		if (!isPermanentStripeError(error)) throw error;
		intent = await stripe.paymentIntents.retrieve(intentId);
	}
	if (intent.status !== 'succeeded') {
		await setModificationStatus(db, modificationId, 'payment_failed', now);
		alertModificationProblem(
			deps,
			booking,
			modificationId,
			'The extra charge for a reservation change could not be captured. Collect it from the guest by hand.',
		);
		return;
	}
	const fields = paymentMethodFields(intent);
	await db
		.insert(paymentTransactions)
		.values({
			bookingId: booking.id,
			stripePaymentIntentId: intent.id,
			stripeChargeId: stripeId(intent.latest_charge),
			stripeCustomerId: stripeId(intent.customer),
			amount: intent.amount / 100,
			status: 'paid',
			...fields,
			cardBrand: fields.cardBrand ?? card?.brand ?? null,
			cardLast4: fields.cardLast4 ?? card?.last4 ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
	await setModificationStatus(db, modificationId, 'applied', now);
}

/**
 * Refunds a cheaper change across the booking's payments (newest first).
 * Transient errors leave it refund_pending (the recovery cron retries);
 * a permanent refusal marks it refund_failed and alerts the admins. True
 * when the refund failed for good.
 */
async function refundModification(
	deps: ServiceDeps,
	booking: Booking,
	modificationId: string,
	cents: number,
	now: Date,
	{ retry = false }: { retry?: boolean } = {},
): Promise<boolean> {
	let failure: string | null = null;
	try {
		const result = await refundAcrossPayments(
			deps,
			booking,
			cents,
			{
				reason: 'modification',
				refundKey: `refund-modify/${booking.id}/${modificationId}/${cents}`,
				metadata: { modificationId },
				retry,
			},
			now,
		);
		const first = result.refunds[0];
		if (result.uncoveredCents > 0 || !first) {
			failure = `The payments on this booking do not cover the refund (${formatMoney(result.uncoveredCents / 100)} short)`;
		} else {
			await deps.db
				.update(bookingModifications)
				.set({ status: 'applied', stripeRefundId: first.id, updatedAt: now })
				.where(eq(bookingModifications.id, modificationId));
			return false;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (!isPermanentStripeError(error)) {
			console.error(
				`Refund for a change to ${booking.confirmationId} not created yet (retried by the recovery cron): ${message}`,
			);
			return false;
		}
		failure = message;
	}
	console.error(
		`Refund for a change to ${booking.confirmationId} failed: ${failure}`,
	);
	await setModificationStatus(deps.db, modificationId, 'refund_failed', now);
	createInboxItemInBackground(deps, {
		kind: 'refund_failed',
		title: `Refund failed: ${booking.confirmationId}`,
		summary: `The reservation was changed, but the refund of ${formatMoney(cents / 100)} for the difference could not be created in Stripe. Refund it in the Stripe Dashboard.`,
		details: {
			refundId: 'not created',
			amount: cents / 100,
			currency: 'usd',
			paymentIntentId: booking.stripePaymentIntentId,
			confirmationId: booking.confirmationId,
			failureReason: failure,
			livemode: false,
		},
		bookingId: booking.id,
		userId: booking.userId,
		dedupeKey: `refund_failed:modify:${modificationId}`,
	});
	alertModificationProblem(
		deps,
		booking,
		modificationId,
		`The refund of ${formatMoney(cents / 100)} for a reservation change failed (${failure}). Refund the guest in the Stripe Dashboard.`,
	);
	return true;
}

async function setModificationStatus(
	database: Database,
	modificationId: string,
	status: ModificationStatus,
	now: Date,
) {
	await database
		.update(bookingModifications)
		.set({ status, updatedAt: now })
		.where(eq(bookingModifications.id, modificationId));
}

function alertModificationProblem(
	deps: ServiceDeps,
	booking: Booking,
	modificationId: string,
	message: string,
) {
	inBackground(deps, `modification problem ${booking.confirmationId}`, () =>
		sendAdminAlert(deps.db, deps.env, {
			category: 'payment_problem',
			subject: `Reservation change payment problem: ${booking.confirmationId}`,
			heading: 'A reservation change needs attention',
			paragraphs: [message],
			details: [{ label: 'Confirmation', value: booking.confirmationId }],
			link: {
				label: 'Open booking',
				path: `/admin/bookings/${booking.publicId}`,
			},
			idempotencyKey: `modification-problem/${modificationId}`,
		}),
	);
}

/** Emails the guest and admins and adds the admin inbox item. */
async function notifyModification(
	deps: ServiceDeps,
	booking: Booking,
	modificationId: string,
	now: Date,
) {
	const [mod] = await deps.db
		.select()
		.from(bookingModifications)
		.where(eq(bookingModifications.id, modificationId));
	if (!mod) return;
	const [previousRoom, newRoom] = await Promise.all([
		roomName(deps.db, mod.previousRoomId),
		roomName(deps.db, mod.newRoomId),
	]);
	const label = MODIFICATION_KIND_LABELS[mod.kind];
	createInboxItemInBackground(
		deps,
		{
			kind: 'booking_modified',
			title: `${label}: ${booking.confirmationId}`,
			summary:
				mod.kind === 'release_early'
					? `Released early: now checks out ${mod.newCheckOutDate}. No refund.`
					: `${mod.previousCheckInDate} to ${mod.previousCheckOutDate} -> ${mod.newCheckInDate} to ${mod.newCheckOutDate}; ${mod.differenceCents < 0 ? 'refund' : 'charge'} ${formatMoney(Math.abs(mod.differenceCents) / 100)}.`,
			details: {
				bookingPublicId: booking.publicId,
				confirmationId: booking.confirmationId,
				kind: mod.kind,
				previousRoomName: previousRoom.name,
				newRoomName: newRoom.name,
				previousDates: `${mod.previousCheckInDate} to ${mod.previousCheckOutDate}`,
				newDates: `${mod.newCheckInDate} to ${mod.newCheckOutDate}`,
				previousTotal: mod.previousTotal,
				newTotal: mod.newTotal,
				difference: mod.differenceCents / 100,
				status: mod.status,
				note: mod.note,
			},
			bookingId: booking.id,
			userId: booking.userId,
			dedupeKey: `booking_modified:${modificationId}`,
		},
		{ now },
	);
	inBackground(deps, `modification emails ${booking.confirmationId}`, () =>
		sendBookingModifiedEmails(deps.db, deps.env, booking, newRoom, {
			modificationId,
			label,
			previous: {
				roomName: previousRoom.name,
				checkIn: mod.previousCheckInDate,
				checkOut: mod.previousCheckOutDate,
			},
			previousTotal: mod.previousTotal,
			differenceCents: mod.differenceCents,
			releasedEarly: mod.kind === 'release_early',
		}),
	);
}

// --- Release early -------------------------------------------------------------

/**
 * The guest leaves a stay that has begun: it ends on `newCheckOutDate`
 * (today or later), freeing the later nights. No money moves (early
 * departure: no refund). The original dates stay in the log. Before
 * check-in, a shorter stay is a change instead (repriced, refunded).
 */
export async function releaseRoomEarly(
	deps: ServiceDeps,
	booking: Booking,
	input: { newCheckOutDate: IsoDate; note?: string },
	adminId: string,
	now = new Date(),
) {
	const blocked = modifiableError(booking);
	if (blocked) throw bad(blocked);
	const invalid = releaseEarlyError(
		{ checkIn: booking.checkInDate, checkOut: booking.checkOutDate },
		input.newCheckOutDate,
		todayIn(undefined, now),
		{ stayBegun: now >= booking.checkInAt },
	);
	if (invalid) throw bad(invalid);
	const modificationId = newId();
	const [row] = await deps.db
		.update(bookings)
		.set({
			checkOutDate: input.newCheckOutDate,
			checkOutAt: checkOutAt(input.newCheckOutDate),
			numberOfNights: daysBetween(booking.checkInDate, input.newCheckOutDate),
			lastModificationId: modificationId,
			updatedAt: now,
		})
		.where(
			and(
				eq(bookings.id, booking.id),
				eq(bookings.status, 'confirmed'),
				eq(bookings.updatedAt, booking.updatedAt),
			),
		)
		.returning();
	if (!row) throw changedMeanwhile();
	const kind: ModificationKind = 'release_early';
	await deps.db.insert(bookingModifications).values({
		id: modificationId,
		bookingId: booking.id,
		adminUserId: adminId,
		kind,
		previousRoomId: booking.roomId,
		newRoomId: booking.roomId,
		previousCheckInDate: booking.checkInDate,
		previousCheckOutDate: booking.checkOutDate,
		newCheckInDate: booking.checkInDate,
		newCheckOutDate: input.newCheckOutDate,
		previousTotal: booking.totalAmount,
		newTotal: booking.totalAmount,
		differenceCents: 0,
		status: 'applied',
		note: input.note ?? null,
		createdAt: now,
		updatedAt: now,
	});
	await notifyModification(deps, row, modificationId, now);
	return { modificationId };
}

// --- Fresh card (the saved card can't be charged) -------------------------------

const MODIFICATION_SESSION_MINUTES = 31; // Stripe's minimum is 30

/**
 * A card-only Checkout Session for the difference, when the saved card
 * can't be charged (plan 06): the admin types the card the guest reads out.
 * The change itself (room, dates, price) travels in the session metadata
 * (ids and dates only) and is applied when the session completes
 * (confirmModificationCheckout, from the page or the webhook).
 */
export async function createModificationCheckout(
	deps: ServiceDeps,
	booking: Booking,
	input: Omit<ModifyInput, 'confirmDisputeRefund'>,
	adminId: string,
	now = new Date(),
) {
	const plan = await planModification(deps, booking, input.target, now);
	assertNoDrift(plan, input.expectedDifferenceCents);
	if (plan.differenceCents <= 0) {
		throw bad('This change costs nothing extra: apply it directly.');
	}
	const modificationId = newId();
	const customer = await ensureStripeCustomer(deps, booking);
	const room = await roomName(deps.db, plan.next.roomId);
	const metadata = {
		...modificationMetadata(booking, modificationId),
		kind: 'modification',
		newRoomId: plan.next.roomId,
		newCheckIn: plan.next.checkIn,
		newCheckOut: plan.next.checkOut,
		differenceCents: String(plan.differenceCents),
		adminId,
	};
	const expiresAt =
		Math.floor(now.getTime() / 1000) + MODIFICATION_SESSION_MINUTES * 60;
	const session = await deps.stripe.checkout.sessions.create(
		{
			mode: 'payment',
			ui_mode: 'elements',
			customer,
			client_reference_id: booking.id,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: 'usd',
						unit_amount: plan.differenceCents,
						product_data: {
							name: `Reservation change: ${room.name}, ${plan.next.checkIn} to ${plan.next.checkOut}`,
						},
					},
				},
			],
			metadata,
			allowed_payment_method_types: ['card'],
			payment_intent_data: {
				capture_method: 'manual',
				setup_future_usage: 'off_session',
				metadata,
				description: `Irishette booking ${booking.confirmationId} change`,
			},
			saved_payment_method_options: { payment_method_save: 'disabled' },
			return_url: `${deps.env.BETTER_AUTH_URL}/admin/bookings/${booking.publicId}`,
			expires_at: expiresAt,
		},
		{ idempotencyKey: `checkout-modify/${modificationId}` },
	);
	if (!session.client_secret) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'The payment could not be prepared. Please try again.',
		});
	}
	return {
		clientSecret: session.client_secret,
		differenceCents: plan.differenceCents,
		modificationId,
	};
}

/** Our modification session's change, from its metadata (null if not one). */
function sessionChange(session: Stripe.Checkout.Session) {
	const m = session.metadata ?? {};
	if (
		m.kind !== 'modification' ||
		!m.bookingId ||
		!m.modificationId ||
		!m.newRoomId ||
		!m.newCheckIn ||
		!m.newCheckOut
	) {
		return null;
	}
	return {
		bookingId: m.bookingId,
		modificationId: m.modificationId,
		adminId: m.adminId ?? null,
		target: {
			roomId: m.newRoomId,
			checkInDate: m.newCheckIn,
			checkOutDate: m.newCheckOut,
		},
	};
}

/** True for a Checkout Session that pays for a reservation change. */
export const isModificationSession = (session: Stripe.Checkout.Session) =>
	session.metadata?.kind === 'modification';

/**
 * Applies a change paid with a fresh card (the admin page and the
 * checkout.session.completed webhook; idempotent). Re-plans against the
 * booking as it is now: if the dates were taken or the price moved, the
 * authorization is cancelled (nothing charged) and the error thrown.
 */
export async function confirmModificationCheckout(
	deps: ServiceDeps,
	sessionId: string,
	{ note }: { note?: string } = {},
	now = new Date(),
): Promise<Extract<ModifyResult, { status: 'applied' }>> {
	const { session, change, intent, booking } = await loadModificationSession(
		deps,
		sessionId,
	);
	const [existing] = await deps.db
		.select()
		.from(bookingModifications)
		.where(eq(bookingModifications.id, change.modificationId));
	if (existing) {
		return resumeAppliedChange(deps, booking, existing, intent.id, note, now);
	}
	if (intent.status !== 'requires_capture') {
		throw bad('The card was not authorized for this change.');
	}
	let plan: Plan;
	try {
		plan = await planModification(deps, booking, change.target, now);
		assertNoDrift(plan, session.amount_total ?? -1);
	} catch (error) {
		await cancelIntent(deps.stripe, intent.id);
		throw error;
	}
	const pm = intent.payment_method;
	const card =
		pm && typeof pm === 'object'
			? { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
			: null;
	return applyModification(
		deps,
		booking,
		plan,
		{
			modificationId: change.modificationId,
			adminId: change.adminId,
			note: note ?? null,
			intent,
			card,
		},
		now,
	);
}

/**
 * The completed modification session, its change, PaymentIntent and
 * booking. A session whose booking is gone has its authorization cancelled.
 */
async function loadModificationSession(deps: ServiceDeps, sessionId: string) {
	const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['payment_intent', 'payment_intent.payment_method'],
	});
	const change = sessionChange(session);
	const intent = sessionIntent(session);
	if (!change || session.status !== 'complete' || !intent) {
		throw bad('This payment is not a completed reservation change.');
	}
	const booking = await loadBooking(deps.db, change.bookingId);
	if (!booking) {
		if (intent.status === 'requires_capture') {
			await cancelIntent(deps.stripe, intent.id);
		}
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
	}
	return { session, change, intent, booking };
}

/** A change already applied (the webhook and the page both confirm). */
async function resumeAppliedChange(
	deps: ServiceDeps,
	booking: Booking,
	existing: typeof bookingModifications.$inferSelect,
	intentId: string,
	note: string | undefined,
	now: Date,
): Promise<Extract<ModifyResult, { status: 'applied' }>> {
	if (note && !existing.note) {
		await deps.db
			.update(bookingModifications)
			.set({ note, updatedAt: now })
			.where(eq(bookingModifications.id, existing.id));
	}
	if (existing.status === 'payment_pending') {
		await finishModificationPayment(
			deps,
			booking,
			existing.id,
			intentId,
			null,
			now,
		);
	}
	return {
		status: 'applied',
		modificationId: existing.id,
		differenceCents: existing.differenceCents,
		refundFailed: false,
	};
}

// --- Recovery (cron) --------------------------------------------------------------

/**
 * Payment recovery for changes a stopped Worker left half done: an extra
 * charge authorized but not captured (payment_pending), or a refund not
 * created (refund_pending), older than `before`. Returns how many settled.
 */
export async function recoverModifications(
	deps: ServiceDeps,
	before: Date,
	now = new Date(),
) {
	const stuck = await deps.db
		.select()
		.from(bookingModifications)
		.where(
			inArray(bookingModifications.status, [
				'payment_pending',
				'refund_pending',
			]),
		);
	let settled = 0;
	for (const mod of stuck.filter((m) => m.updatedAt <= before)) {
		try {
			const booking = await loadBooking(deps.db, mod.bookingId);
			if (!booking) continue;
			if (mod.status === 'payment_pending' && mod.stripePaymentIntentId) {
				await finishModificationPayment(
					deps,
					booking,
					mod.id,
					mod.stripePaymentIntentId,
					null,
					now,
				);
			} else if (mod.status === 'refund_pending') {
				await refundModification(
					deps,
					booking,
					mod.id,
					-mod.differenceCents,
					now,
					{ retry: true },
				);
			}
			settled++;
		} catch (error) {
			console.error(
				`Recovery of change ${mod.id} failed (retried next run):`,
				error instanceof Error ? error.message : 'Unknown error',
			);
		}
	}
	return settled;
}
