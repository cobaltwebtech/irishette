/**
 * Shared types and utilities for booking components
 */

// Helper function to create a date from YYYY-MM-DD string without timezone conversion
export function parseISODateString(dateString: string): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day); // month is 0-indexed
}

/**
 * A day picker's local calendar date as `YYYY-MM-DD` (no time zone shift;
 * the inverse of parseISODateString).
 */
export function toISODateString(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface BookingStepItem {
	step: string;
	label: string;
	completed: boolean;
}

/** Server pricing that is complete enough for checkout. Zero fees or taxes
 * are valid (a room may have no fee or tax); only missing values are not. */
export function isPricingComplete(pricing: {
	baseAmount?: number | null;
	feesAmount?: number | null;
	taxAmount?: number | null;
	totalAmount?: number | null;
	numberOfNights?: number | null;
}): boolean {
	return (
		pricing.baseAmount != null &&
		pricing.feesAmount != null &&
		pricing.taxAmount != null &&
		pricing.totalAmount != null &&
		(pricing.numberOfNights ?? 0) > 0
	);
}
