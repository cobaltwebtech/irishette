import { z } from 'zod';

import { isoDateSchema } from '@/lib/date-range';
import { icalFeedSources } from '@/lib/ical-feed-sources';
import { isSafeFeedUrl } from '@/lib/ical-fetch';
import { publicIdSchema } from '@/lib/ids';

// Zod >= 4.6 throws on .omit()/.partial() of refined schemas, so derived
// schemas start from unrefined base objects and add refinements last.

const roomStatusSchema = z.enum(['active', 'inactive', 'archived']);

const rate = (label: string) =>
	z
		.number()
		.min(0, `${label} cannot be negative`)
		.max(1, `${label} cannot exceed 100%`);

const roomBaseSchema = z.object({
	name: z.string().trim().min(1, 'Room name is required'),
	slug: z
		.string()
		.trim()
		.min(1, 'Room slug is required')
		.regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
	description: z.string().optional(),
	basePrice: z.number().min(0, 'Price cannot be negative'),
	serviceFeeRate: rate('Service fee rate').default(0.12),
	// Hotel Occupancy Tax rates (as decimals: 0.06 = 6%, 0.07 = 7%)
	stateTaxRate: rate('State tax rate').default(0.06),
	cityTaxRate: rate('City tax rate').default(0.07),
	status: roomStatusSchema.default('active'),
	// Admin-editable guest limit, enforced on booking.
	maxGuests: z.number().int().min(1).max(10).default(2),
});

export const createRoomSchema = roomBaseSchema;

export const updateRoomSchema = roomBaseSchema.partial().extend({
	id: z.string().min(1),
});

// Room queries: by internal id (booking flow), publicId (admin routes) or
// slug (public room pages)
export const getRoomSchema = z.union([
	z.object({ id: z.string().min(1) }),
	z.object({ publicId: publicIdSchema }),
	z.object({ slug: z.string().min(1).max(100) }),
]);

/** Public room list: active rooms only, so no status filter. */
export const getRoomsSchema = z.object({
	limit: z.number().min(1).max(100).default(10),
	offset: z.number().min(0).default(0),
});

/** Admin room list: every status, optionally filtered. */
export const adminGetRoomsSchema = getRoomsSchema.extend({
	status: roomStatusSchema.optional(),
});

export const roomIdSchema = z.object({ roomId: z.string().min(1) });

// --- Blocked periods (inclusive start/end) ---------------------------------

const endNotBeforeStart = {
	message: 'End date must be on or after the start date',
	path: ['endDate'],
};

/** Partial update input: end >= start when both are given. */
const updateDatesInOrder = (d: { startDate?: string; endDate?: string }) =>
	!d.startDate || !d.endDate || d.startDate <= d.endDate;

const blockedPeriodBaseSchema = z.object({
	roomId: z.string().min(1),
	startDate: isoDateSchema,
	endDate: isoDateSchema,
	reason: z.string().trim().min(1, 'Reason is required').max(200),
	notes: z.string().max(1000).optional(),
});

export const createBlockedPeriodSchema = blockedPeriodBaseSchema.refine(
	(d) => d.startDate <= d.endDate,
	endNotBeforeStart,
);

export const updateBlockedPeriodSchema = blockedPeriodBaseSchema
	.omit({ roomId: true })
	.partial()
	.extend({ id: z.string().min(1) })
	.refine(updateDatesInOrder, endNotBeforeStart);

export const getBlockedPeriodsSchema = z.object({
	roomId: z.string().optional(),
	/** Periods overlapping [startDate, endDate] (inclusive). */
	startDate: isoDateSchema.optional(),
	endDate: isoDateSchema.optional(),
	limit: z.number().min(1).max(100).default(50),
	offset: z.number().min(0).default(0),
});

export const deleteBlockedPeriodSchema = z.object({ id: z.string().min(1) });

// --- Pricing rules (inclusive start/end; start = end allowed) ---------------

const pricingRuleTypeSchema = z.enum([
	'surcharge_rate',
	'fixed_amount',
	'absolute_price',
]);

const pricingRuleBaseSchema = z.object({
	roomId: z.string().min(1),
	name: z.string().trim().min(1, 'Rule name is required').max(100),
	ruleType: pricingRuleTypeSchema,
	value: z.number().min(0, 'Value must be positive'),
	startDate: isoDateSchema,
	endDate: isoDateSchema,
	isActive: z.boolean().default(true),
});

const surchargeInRange = {
	message: 'Surcharge rate must be between 0 and 5 (0% to 500%)',
	path: ['value'],
};
const validSurcharge = (d: { ruleType?: string; value?: number }) =>
	d.ruleType !== 'surcharge_rate' || d.value === undefined || d.value <= 5;

export const createPricingRuleSchema = pricingRuleBaseSchema
	.refine((d) => d.startDate <= d.endDate, endNotBeforeStart)
	.refine(validSurcharge, surchargeInRange);

export const updatePricingRuleSchema = pricingRuleBaseSchema
	.omit({ roomId: true })
	.partial()
	.extend({ id: z.string().min(1) })
	.refine(updateDatesInOrder, endNotBeforeStart)
	.refine(validSurcharge, surchargeInRange);

export const getPricingRulesSchema = z.object({
	roomId: z.string().min(1),
	isActive: z.boolean().optional(),
	/** Rules overlapping [startDate, endDate] (inclusive). */
	startDate: isoDateSchema.optional(),
	endDate: isoDateSchema.optional(),
});

export const deletePricingRuleSchema = z.object({ id: z.string().min(1) });

// --- Calendar ----------------------------------------------------------------

export const calculatePricingSchema = z
	.object({
		roomId: z.string().min(1),
		checkInDate: isoDateSchema,
		checkOutDate: isoDateSchema,
		/** Ignored (no guest surcharge); kept for older clients. */
		guestCount: z.number().int().min(1).optional(),
	})
	.refine((d) => d.checkOutDate > d.checkInDate, {
		message: 'Check-out must be after check-in',
		path: ['checkOutDate'],
	});

// --- iCal feeds (admin) -------------------------------------------------------

const icalFeedSourceSchema = z.enum(icalFeedSources);

/** Public https URL with a host name (see isSafeFeedUrl). */
const feedUrlSchema = z
	.string()
	.trim()
	.max(2000)
	.refine(isSafeFeedUrl, 'Enter a public https URL');

export const createIcalFeedSchema = z.object({
	roomId: z.string().min(1),
	source: icalFeedSourceSchema,
	label: z.string().trim().max(100).optional(),
	url: feedUrlSchema,
	isActive: z.boolean().default(true),
});

export const updateIcalFeedSchema = z.object({
	id: z.string().min(1),
	source: icalFeedSourceSchema.optional(),
	label: z.string().trim().max(100).nullable().optional(),
	url: feedUrlSchema.optional(),
	isActive: z.boolean().optional(),
});

export const testIcalUrlSchema = z.object({ url: feedUrlSchema });

// --- Types ---------------------------------------------------------------------

export type CreateBlockedPeriod = z.input<typeof createBlockedPeriodSchema>;
export type UpdateBlockedPeriod = z.input<typeof updateBlockedPeriodSchema>;
export type RoomBlockedPeriod = CreateBlockedPeriod & { id?: string };
export type CreatePricingRule = z.input<typeof createPricingRuleSchema>;
export type UpdatePricingRule = z.input<typeof updatePricingRuleSchema>;
export type RoomPricingRule = CreatePricingRule & { id?: string };
