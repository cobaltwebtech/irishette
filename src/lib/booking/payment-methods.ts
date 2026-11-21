// Payment method labels shared by the server and the admin pages. Pure,
// client-safe.

/**
 * payment_transactions.payment_method of a payment an admin took outside
 * Stripe (cash, check or another way) and reconciles by hand. The row has
 * no Stripe ids.
 */
export const OFFLINE_PAYMENT_METHOD = 'offline';

/** How the admin pages and emails name an offline payment. */
export const OFFLINE_PAYMENT_LABEL = 'Cash/Check/Other';

/**
 * Prefix of payment_refunds.stripe_refund_id for a refund owed on an
 * offline payment (source 'offline'): there is no Stripe refund, and the
 * column is required and unique, so the id is made from the refund key.
 */
export const OFFLINE_REFUND_PREFIX = 'offline_';

/** "visa ending 4242", "Link", "Cash/Check/Other" or the raw method type. */
export function paymentMethodLabel(payment: {
	paymentMethod: string | null;
	cardBrand: string | null;
	cardLast4: string | null;
}): string {
	if (payment.cardBrand && payment.cardLast4) {
		return `${payment.cardBrand} ending ${payment.cardLast4}`;
	}
	if (payment.paymentMethod === 'link') return 'Link';
	if (payment.paymentMethod === OFFLINE_PAYMENT_METHOD) {
		return OFFLINE_PAYMENT_LABEL;
	}
	return payment.paymentMethod ?? 'card';
}

/** Where a refund went: back through Stripe, owed by hand, or both. */
export type RefundChannel = 'stripe' | 'offline' | 'mixed';

export function refundChannel(refundIds: readonly string[]): RefundChannel {
	const offline = refundIds.filter((id) =>
		id.startsWith(OFFLINE_REFUND_PREFIX),
	).length;
	if (offline === 0) return 'stripe';
	return offline === refundIds.length ? 'offline' : 'mixed';
}
