// Small display formatters shared by the server (emails, notifications) and
// the admin pages. Pure, client-safe.

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** 250 -> "$250.00" (amounts are in major units, e.g. dollars). */
export function formatMoney(amount: number, currency = 'usd'): string {
	const code = currency.toUpperCase();
	let f = moneyFormatters.get(code);
	if (!f) {
		f = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
		moneyFormatters.set(code, f);
	}
	return f.format(amount);
}

/** A Stripe code for people: "requested_by_customer" -> "Requested by customer". */
export function humanizeCode(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}
