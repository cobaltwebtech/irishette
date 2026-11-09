// Date rules for stays, holds, imported events, admin blocks and pricing
// rules (plan Appendix A). Pure: dates are `YYYY-MM-DD` strings compared as
// strings, with no timezone math. Shared by the server (availability,
// pricing, iCal) and the room calendar.
//
// A stay's nights are [checkIn, checkOut). Imported events end EXCLUSIVE
// (iCal DTEND). Admin blocks and pricing rules are INCLUSIVE on both ends.

import { z } from 'zod';

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
	.string()
	.refine(isIsoDate, 'Date must be a valid YYYY-MM-DD date');

/** `date` plus `days` (may be negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * `date` plus `months` calendar months, clamped to the month's last day
 * (Jan 31 + 1 month = Feb 28/29).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
	const [y, m, d] = date.split('-').map(Number);
	const first = new Date(Date.UTC(y, m - 1 + months, 1));
	const lastDay = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
	).getUTCDate();
	first.setUTCDate(Math.min(d, lastDay));
	return first.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
	const ms =
		new Date(`${to}T00:00:00Z`).getTime() -
		new Date(`${from}T00:00:00Z`).getTime();
	return Math.round(ms / 86_400_000);
}

/** The nights of a stay: checkIn, checkIn+1, ..., checkOut-1. */
export function stayNights(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
	const nights: IsoDate[] = [];
	for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
	return nights;
}

// --- Booking limits (server and calendar) -----------------------------------

/** Longest stay a guest can book online. */
export const MAX_NIGHTS = 30;
/** How far ahead guests can book: check-out within this many months. */
export const BOOKING_WINDOW_MONTHS = 10;

/** The last check-out date a new booking may have, from `today`. */
export const lastBookableDate = (today: IsoDate) =>
	addMonths(today, BOOKING_WINDOW_MONTHS);

// --- Overlap rules ---------------------------------------------------------

export interface Stay {
	checkIn: IsoDate;
	checkOut: IsoDate; // exclusive
}
export interface ExclusiveRange {
	start: IsoDate;
	end: IsoDate; // exclusive
}
export interface InclusiveRange {
	start: IsoDate;
	end: IsoDate; // inclusive
}

/** Stay vs another booking or hold. Same-day turnover is allowed. */
export function stayOverlapsStay(a: Stay, b: Stay): boolean {
	return a.checkIn < b.checkOut && a.checkOut > b.checkIn;
}

/** Stay vs an imported event (end exclusive). */
export function stayOverlapsEvent(stay: Stay, event: ExclusiveRange): boolean {
	return stay.checkIn < event.end && stay.checkOut > event.start;
}

/**
 * Stay vs an admin block (inclusive). Check-out on the block's first day is
 * fine; check-in on its last day is not.
 */
export function stayOverlapsBlock(stay: Stay, block: InclusiveRange): boolean {
	return stay.checkIn <= block.end && stay.checkOut > block.start;
}

/** Two inclusive ranges (pricing rules) share at least one day. */
export function inclusiveRangesOverlap(
	a: InclusiveRange,
	b: InclusiveRange,
): boolean {
	return a.start <= b.end && b.start <= a.end;
}

// --- Calendar ----------------------------------------------------------------

export interface Unavailability {
	/** Stays (bookings and live holds), end exclusive. */
	stays: Stay[];
	/** Imported events, end exclusive. */
	events: ExclusiveRange[];
	/** Admin blocks, inclusive. */
	blocks: InclusiveRange[];
}

/**
 * True if night `date` cannot be slept in: a booked or held night, an imported
 * event night, or a blocked day. These days are not available for check-in.
 */
export function isNightUnavailable(date: IsoDate, u: Unavailability): boolean {
	return (
		u.stays.some((s) => s.checkIn <= date && date < s.checkOut) ||
		u.events.some((e) => e.start <= date && date < e.end) ||
		u.blocks.some((b) => b.start <= date && date <= b.end)
	);
}

/** Check-in on `date` is impossible (the first night is unavailable). */
export const isCheckInDisabled = isNightUnavailable;

/**
 * Check-out on `checkOut` after checking in on `checkIn` is allowed if no
 * night in [checkIn, checkOut) is unavailable. `checkOut` itself may be
 * another booking's check-in or a block's first day.
 */
export function isCheckOutAllowed(
	checkIn: IsoDate,
	checkOut: IsoDate,
	u: Unavailability,
): boolean {
	if (checkOut <= checkIn) return false;
	return stayNights(checkIn, checkOut).every((n) => !isNightUnavailable(n, u));
}

/** True if a whole stay is free under the rules above. */
export function isStayAvailable(stay: Stay, u: Unavailability): boolean {
	return (
		!u.stays.some((s) => stayOverlapsStay(stay, s)) &&
		!u.events.some((e) => stayOverlapsEvent(stay, e)) &&
		!u.blocks.some((b) => stayOverlapsBlock(stay, b))
	);
}
