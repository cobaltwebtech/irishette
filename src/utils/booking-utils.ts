/**
 * Shared types and utilities for booking components
 */

// Helper function to create a date from YYYY-MM-DD string without timezone conversion
export function parseISODateString(dateString: string): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day); // month is 0-indexed
}

export interface BookingStepItem {
	step: string;
	label: string;
	completed: boolean;
}
