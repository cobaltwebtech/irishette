// Hotel occupancy tax on money moved for a booking (plan 06). Pure and
// client-safe. Each payment and app refund stores how much of it is room,
// service fee, taxable receipts and state / city tax, so the tax report adds
// up exactly what was charged and returned.
//
// Texas rule (Comptroller quick reference for hotels, "Room Cancellation
// Fee"): tax is due on money kept for a cancelled room only when the FULL
// room rate is kept and the cancellation is within 30 days of the stay.
// Keeping a percentage is not taxable. So a refund returns the tax on the
// cancelled nights in full, then the policy share of the room price and fee,
// except when nothing is refunded within 30 days of check-in (the full rate
// is kept and taxed). docs/TAX_REPORTING.md.

/** Dollars, as stored. `taxable` is the receipts the tax was charged on. */
export interface TaxSplit {
	room: number;
	fees: number;
	taxable: number;
	stateTax: number;
	cityTax: number;
}

/** A stay's money columns (dollars, as on bookings). */
export interface StayAmounts {
	baseAmount: number;
	feesAmount: number;
	taxAmount: number;
	totalAmount: number;
	taxableAmount: number;
	stateTaxAmount: number;
	cityTaxAmount: number;
}

/** A booking's tax split (null without a tax snapshot: legacy rows). */
export function bookingSplit(booking: {
	baseAmount: number;
	feesAmount: number | null;
	taxableAmount: number | null;
	stateTaxAmount: number | null;
	cityTaxAmount: number | null;
}): TaxSplit | null {
	if (
		booking.taxableAmount == null ||
		booking.stateTaxAmount == null ||
		booking.cityTaxAmount == null
	) {
		return null;
	}
	return {
		room: booking.baseAmount,
		fees: booking.feesAmount ?? 0,
		taxable: booking.taxableAmount,
		stateTax: booking.stateTaxAmount,
		cityTax: booking.cityTaxAmount,
	};
}

/** A split as payment_transactions / payment_refunds columns. */
export const splitColumns = (split: TaxSplit | null) => ({
	roomAmount: split?.room ?? null,
	feesAmount: split?.fees ?? null,
	taxableAmount: split?.taxable ?? null,
	stateTaxAmount: split?.stateTax ?? null,
	cityTaxAmount: split?.cityTax ?? null,
});

/** Tax stays due on a full kept rate only this close to check-in. */
export const FULL_RATE_TAX_WINDOW_DAYS = 30;

const cents = (dollars: number) => Math.round(dollars * 100);
const dollars = (value: number) => value / 100;

/**
 * Whether the tax on money kept from a cancellation stays due: only when
 * nothing is refunded (the full rate is kept) within 30 days of check-in.
 */
export function taxDueOnKept(
	refundPercent: number,
	checkInAt: Date,
	now: Date,
): boolean {
	const windowMs = FULL_RATE_TAX_WINDOW_DAYS * 86_400_000;
	return refundPercent === 0 && checkInAt.getTime() - now.getTime() <= windowMs;
}

/**
 * What a cancellation (or dropped nights) refunds under a policy tier: the
 * tier's percentage of the room price and fee, plus all the tax, unless the
 * tax stays due (`taxDue`: nothing refunded within 30 days). Cents.
 */
export function policyRefundCents(
	paid: TaxSplit,
	refundPercent: number,
	taxDue: boolean,
): number {
	const preTax = cents(paid.room) + cents(paid.fees);
	const tax = cents(paid.stateTax) + cents(paid.cityTax);
	const share = (value: number) => Math.round((value * refundPercent) / 100);
	return share(preTax) + (taxDue ? share(tax) : tax);
}

export const splitTotalCents = (s: TaxSplit) =>
	cents(s.room) + cents(s.fees) + cents(s.stateTax) + cents(s.cityTax);

/** The split of a stay's stored amounts. */
export const splitOfStay = (a: StayAmounts): TaxSplit => ({
	room: a.baseAmount,
	fees: a.feesAmount,
	taxable: a.taxableAmount,
	stateTax: a.stateTaxAmount,
	cityTax: a.cityTaxAmount,
});

/** `a - b`, part by part (a change's extra charge or refund pool). */
export function subtractSplit(a: TaxSplit, b: TaxSplit): TaxSplit {
	const minus = (x: number, y: number) => dollars(cents(x) - cents(y));
	return {
		room: minus(a.room, b.room),
		fees: minus(a.fees, b.fees),
		taxable: minus(a.taxable, b.taxable),
		stateTax: minus(a.stateTax, b.stateTax),
		cityTax: minus(a.cityTax, b.cityTax),
	};
}

/**
 * The split of a refund of `refundCents` out of `pool` (what was paid for the
 * nights being refunded): the tax first, then the room and fee in
 * proportion. Once all the pool's tax is refunded its taxable receipts are
 * too, so whatever is kept is untaxed. Capped at the pool's total.
 */
export function refundSplitTaxFirst(
	pool: TaxSplit,
	refundCents: number,
): TaxSplit {
	const amount = Math.max(0, Math.min(refundCents, splitTotalCents(pool)));
	const state = cents(pool.stateTax);
	const city = cents(pool.cityTax);
	const taxPool = state + city;
	const taxRefund = Math.min(amount, taxPool);
	const stateRefund =
		taxPool > 0 ? Math.round((taxRefund * state) / taxPool) : 0;
	const rest = amount - taxRefund;
	const room = cents(pool.room);
	const fees = cents(pool.fees);
	const preTax = room + fees;
	const feesRefund = preTax > 0 ? Math.round((rest * fees) / preTax) : 0;
	const taxable = cents(pool.taxable);
	const taxableRefund =
		taxPool > 0
			? Math.round((taxable * taxRefund) / taxPool)
			: preTax > 0
				? Math.round((taxable * rest) / preTax)
				: 0;
	return {
		room: dollars(rest - feesRefund),
		fees: dollars(feesRefund),
		taxable: dollars(taxableRefund),
		stateTax: dollars(stateRefund),
		cityTax: dollars(taxRefund - stateRefund),
	};
}

/**
 * Divides a split across several Stripe refunds (one per payment) in
 * proportion to their amounts; the last one takes the remaining cents.
 */
export function divideSplit(split: TaxSplit, partsCents: number[]): TaxSplit[] {
	const total = partsCents.reduce((sum, part) => sum + part, 0);
	const keys = ['room', 'fees', 'taxable', 'stateTax', 'cityTax'] as const;
	const left = Object.fromEntries(
		keys.map((k) => [k, cents(split[k])]),
	) as Record<(typeof keys)[number], number>;
	return partsCents.map((part, index) => {
		const last = index === partsCents.length - 1;
		const out = {} as TaxSplit;
		for (const key of keys) {
			const value = last
				? left[key]
				: total > 0
					? Math.round((cents(split[key]) * part) / total)
					: 0;
			left[key] -= value;
			out[key] = dollars(value);
		}
		return out;
	});
}
