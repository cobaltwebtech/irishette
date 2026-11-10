// Per-night pricing, shared by the room calendar (rooms.calculatePricing) and
// checkout (bookings.calculateBooking / createBooking). Pure.
//
// Each night is priced on its own: the price of the active rule that covers
// the night (inclusive start/end), else the room's base price. Active rules
// may not overlap; if legacy data has overlaps, the rule activated first wins.
// There is no guest-count surcharge.

import { type IsoDate, stayNights } from '@/utils/date-range';

export type PricingRuleType =
	| 'surcharge_rate'
	| 'fixed_amount'
	| 'absolute_price';

export interface PricingRoom {
	basePrice: number;
	serviceFeeRate: number;
	stateTaxRate: number;
	cityTaxRate: number;
}

export interface PricingRule {
	id: string;
	name: string;
	// oxlint-disable-next-line typescript/no-redundant-type-constituents -- keeps the known literals visible for autocomplete
	ruleType: PricingRuleType | string;
	value: number;
	startDate: IsoDate; // inclusive
	endDate: IsoDate; // inclusive
	isActive?: boolean | null;
	activatedAt?: Date | null;
	createdAt?: Date | null;
}

export interface NightPrice {
	date: IsoDate;
	price: number;
	ruleId: string | null;
}

export interface AppliedRule {
	id: string;
	name: string;
	ruleType: string;
	value: number;
	nights: number;
	/** Difference from the base price over the nights the rule priced. */
	appliedAmount: number;
}

export interface StayPrice {
	numberOfNights: number;
	nights: NightPrice[];
	/** Room price for all nights (taxable, with the service fee). */
	baseAmount: number;
	feesAmount: number;
	taxAmount: number;
	totalAmount: number;
	appliedRules: AppliedRule[];
	taxBreakdown: {
		stateTaxRate: number;
		cityTaxRate: number;
		stateTaxAmount: number;
		cityTaxAmount: number;
		totalTaxAmount: number;
		taxableAmount: number;
	};
}

/** Round to cents (half away from zero, robust to float noise). */
export function roundCents(amount: number): number {
	return (Math.sign(amount) * Math.round(Math.abs(amount) * 100 + 1e-9)) / 100;
}

/** Price of one night under a rule. */
export function ruleNightPrice(basePrice: number, rule: PricingRule): number {
	switch (rule.ruleType) {
		case 'surcharge_rate':
			return roundCents(basePrice * (1 + rule.value));
		case 'fixed_amount':
			return roundCents(basePrice + rule.value);
		case 'absolute_price':
			return roundCents(rule.value);
		default:
			return roundCents(basePrice);
	}
}

const timeOf = (d: Date | null | undefined) =>
	d ? d.getTime() : Number.POSITIVE_INFINITY;

/** Earliest activated first; then earliest created; then id. */
function compareRulePrecedence(a: PricingRule, b: PricingRule): number {
	return (
		timeOf(a.activatedAt) - timeOf(b.activatedAt) ||
		timeOf(a.createdAt) - timeOf(b.createdAt) ||
		a.id.localeCompare(b.id)
	);
}

/** The active rule that prices `night`, if any. */
function ruleForNight(
	night: IsoDate,
	rules: PricingRule[],
): PricingRule | undefined {
	return rules
		.filter(
			(r) => r.isActive !== false && r.startDate <= night && night <= r.endDate,
		)
		.sort(compareRulePrecedence)[0];
}

/** Per-night room prices for a stay (no fees or taxes). */
export function priceNights(
	basePrice: number,
	rules: PricingRule[],
	checkIn: IsoDate,
	checkOut: IsoDate,
): NightPrice[] {
	return stayNights(checkIn, checkOut).map((date) => {
		const rule = ruleForNight(date, rules);
		return rule
			? { date, price: ruleNightPrice(basePrice, rule), ruleId: rule.id }
			: { date, price: roundCents(basePrice), ruleId: null };
	});
}

/**
 * Full price of a stay: room price per night, service fee on the room price,
 * and hotel occupancy taxes (state + city) on the room price plus the
 * service fee (a mandatory room charge, so part of the taxable receipts).
 */
export function priceStay(
	room: PricingRoom,
	rules: PricingRule[],
	checkIn: IsoDate,
	checkOut: IsoDate,
): StayPrice {
	const nights = priceNights(room.basePrice, rules, checkIn, checkOut);
	if (nights.length === 0) {
		throw new RangeError('Check-out must be after check-in');
	}
	const baseAmount = roundCents(nights.reduce((sum, n) => sum + n.price, 0));

	const appliedRules: AppliedRule[] = [];
	for (const rule of rules) {
		const priced = nights.filter((n) => n.ruleId === rule.id);
		if (priced.length === 0) continue;
		appliedRules.push({
			id: rule.id,
			name: rule.name,
			ruleType: rule.ruleType,
			value: rule.value,
			nights: priced.length,
			appliedAmount: roundCents(
				priced.reduce((sum, n) => sum + n.price - room.basePrice, 0),
			),
		});
	}

	const feesAmount = roundCents(baseAmount * room.serviceFeeRate);
	const taxableAmount = roundCents(baseAmount + feesAmount);
	const stateTaxAmount = roundCents(taxableAmount * room.stateTaxRate);
	const cityTaxAmount = roundCents(taxableAmount * room.cityTaxRate);
	const taxAmount = roundCents(stateTaxAmount + cityTaxAmount);

	return {
		numberOfNights: nights.length,
		nights,
		baseAmount,
		feesAmount,
		taxAmount,
		totalAmount: roundCents(baseAmount + feesAmount + taxAmount),
		appliedRules,
		taxBreakdown: {
			stateTaxRate: room.stateTaxRate,
			cityTaxRate: room.cityTaxRate,
			stateTaxAmount,
			cityTaxAmount,
			totalTaxAmount: taxAmount,
			taxableAmount,
		},
	};
}
