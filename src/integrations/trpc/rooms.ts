import { TRPCError } from '@trpc/server';
import {
	and,
	asc,
	eq,
	gte,
	lte,
	ne,
	notExists,
	type SQL,
	sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';

import type { Database } from '@/db/drizzle-init';
import { room, roomBlockedPeriods, roomPricingRules } from '@/db/schema-export';
import { blockIsFree, findBlockConflicts } from '@/lib/availability';
import { quoteStay } from '@/lib/booking-service';
import { inclusiveRangesOverlap } from '@/lib/date-range';
import { isUniqueViolation } from '@/lib/db-errors';
import { newId } from '@/lib/ids';
import {
	adminGetRoomsSchema,
	calculatePricingSchema,
	createBlockedPeriodSchema,
	createPricingRuleSchema,
	createRoomSchema,
	deleteBlockedPeriodSchema,
	deletePricingRuleSchema,
	getBlockedPeriodsSchema,
	getPricingRulesSchema,
	getRoomSchema,
	getRoomsSchema,
	updateBlockedPeriodSchema,
	updatePricingRuleSchema,
	updateRoomSchema,
} from '@/lib/room-validation';
import { todayIn } from '@/lib/timezone';

import {
	adminProcedure,
	createTRPCRouter,
	publicProcedure,
	rateLimit,
} from './init';

/**
 * Room fields safe for anyone. Never the iCal export token; feed URLs live in
 * ical_feeds and are only returned by admin procedures (ical router).
 */
const publicRoomColumns = {
	id: room.id,
	publicId: room.publicId,
	name: room.name,
	slug: room.slug,
	description: room.description,
	basePrice: room.basePrice,
	serviceFeeRate: room.serviceFeeRate,
	stateTaxRate: room.stateTaxRate,
	cityTaxRate: room.cityTaxRate,
	maxGuests: room.maxGuests,
	status: room.status,
	isActive: room.isActive,
	createdAt: room.createdAt,
	updatedAt: room.updatedAt,
};

async function requireRoom(db: Database, roomId: string) {
	const [row] = await db
		.select({ id: room.id })
		.from(room)
		.where(eq(room.id, roomId));
	if (!row)
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
}

function rejectPastDate(date: string, label: string) {
	if (date < todayIn()) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `${label} cannot be in the past`,
		});
	}
}

// --- Pricing rules -----------------------------------------------------------

type Rule = typeof roomPricingRules.$inferSelect;

function conflictDetails(rule: Rule) {
	return {
		id: rule.id,
		name: rule.name,
		startDate: rule.startDate,
		endDate: rule.endDate,
	};
}

/** First active rule in the room overlapping [start, end], except `excludeId`. */
async function findOverlappingRule(
	db: Database,
	roomId: string,
	start: string,
	end: string,
	excludeId?: string,
) {
	const conditions = [
		eq(roomPricingRules.roomId, roomId),
		eq(roomPricingRules.isActive, true),
		lte(roomPricingRules.startDate, end),
		gte(roomPricingRules.endDate, start),
	];
	if (excludeId) conditions.push(ne(roomPricingRules.id, excludeId));
	const [rule] = await db
		.select()
		.from(roomPricingRules)
		.where(and(...conditions))
		.orderBy(asc(roomPricingRules.startDate))
		.limit(1);
	return rule;
}

function overlapError(rule: Rule): TRPCError {
	return new TRPCError({
		code: 'CONFLICT',
		message: `Overlaps with "${rule.name}" (${rule.startDate} to ${rule.endDate})`,
		cause: { conflict: conflictDetails(rule) },
	});
}

const nowSeconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** Rooms page by page, with the total, for `where`. */
async function listRooms(
	db: Database,
	where: SQL | undefined,
	page: { limit: number; offset: number },
) {
	const [rooms, [{ total }]] = await Promise.all([
		db
			.select(publicRoomColumns)
			.from(room)
			.where(where)
			.orderBy(asc(room.name))
			.limit(page.limit)
			.offset(page.offset),
		db
			.select({ total: sql<number>`count(*)` })
			.from(room)
			.where(where),
	]);
	return {
		rooms,
		pagination: {
			total,
			limit: page.limit,
			offset: page.offset,
			hasMore: page.offset + page.limit < total,
		},
	};
}

/** One room by internal id, publicId or slug, optionally within `scope`. */
async function findRoom(
	db: Database,
	input: z.infer<typeof getRoomSchema>,
	scope?: SQL,
) {
	const key =
		'publicId' in input
			? eq(room.publicId, input.publicId)
			: 'slug' in input
				? eq(room.slug, input.slug)
				: eq(room.id, input.id);
	const [result] = await db
		.select(publicRoomColumns)
		.from(room)
		.where(scope ? and(key, scope) : key);
	if (!result) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
	}
	return result;
}

const isActiveRoom = eq(room.status, 'active');

export const roomsRouter = createTRPCRouter({
	/** Bookable (active) rooms. Admin pages use `adminList`. */
	list: publicProcedure
		.input(getRoomsSchema)
		.query(({ ctx, input }) => listRooms(ctx.db, isActiveRoom, input)),

	/** A bookable (active) room; other statuses are NOT_FOUND. */
	get: publicProcedure
		.input(getRoomSchema)
		.query(({ ctx, input }) => findRoom(ctx.db, input, isActiveRoom)),

	/** Every room (any status), optionally filtered by status. */
	adminList: adminProcedure
		.input(adminGetRoomsSchema)
		.query(({ ctx, input }) =>
			listRooms(
				ctx.db,
				input.status ? eq(room.status, input.status) : undefined,
				input,
			),
		),

	/** Any room, whatever its status (room editor). */
	adminGet: adminProcedure
		.input(getRoomSchema)
		.query(({ ctx, input }) => findRoom(ctx.db, input)),

	/** Room price for a stay (calendar). Same calculation as checkout. */
	calculatePricing: publicProcedure
		.use(rateLimit('API_RATE_LIMITER', 'rooms.calculatePricing'))
		.input(calculatePricingSchema)
		.query(async ({ ctx, input }) => {
			const price = await quoteStay(
				ctx.db,
				input.roomId,
				input.checkInDate,
				input.checkOutDate,
			);
			return {
				baseAmount: price.baseAmount,
				numberOfNights: price.numberOfNights,
				nights: price.nights.map((n) => ({ date: n.date, price: n.price })),
				appliedRules: price.appliedRules.map((r) => ({
					name: r.name,
					nights: r.nights,
					appliedAmount: r.appliedAmount,
				})),
				roomBasePrice: price.roomBasePrice,
			};
		}),

	create: adminProcedure
		.input(createRoomSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const [created] = await ctx.db
					.insert(room)
					.values({
						...input,
						description: input.description || null,
						isActive: input.status === 'active',
					})
					.returning(publicRoomColumns);
				return created;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'A room with this slug already exists',
					});
				}
				throw error;
			}
		}),

	update: adminProcedure
		.input(updateRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...changes } = input;
			try {
				const [updated] = await ctx.db
					.update(room)
					.set({
						...changes,
						...(changes.status
							? { isActive: changes.status === 'active' }
							: {}),
						updatedAt: new Date(),
					})
					.where(eq(room.id, id))
					.returning(publicRoomColumns);
				if (!updated) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
				}
				return updated;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'A room with this slug already exists',
					});
				}
				throw error;
			}
		}),

	// --- Pricing rules (admin) ---------------------------------------------

	getPricingRules: adminProcedure
		.input(getPricingRulesSchema)
		.query(async ({ ctx, input }) => {
			const conditions = [eq(roomPricingRules.roomId, input.roomId)];
			if (input.isActive !== undefined) {
				conditions.push(eq(roomPricingRules.isActive, input.isActive));
			}
			if (input.startDate) {
				conditions.push(gte(roomPricingRules.endDate, input.startDate));
			}
			if (input.endDate) {
				conditions.push(lte(roomPricingRules.startDate, input.endDate));
			}
			return ctx.db
				.select()
				.from(roomPricingRules)
				.where(and(...conditions))
				.orderBy(asc(roomPricingRules.startDate));
		}),

	/**
	 * Creates a rule. An active rule may not overlap another active rule in
	 * the room; the check and the insert are one statement, so concurrent
	 * creates cannot both succeed.
	 */
	createPricingRule: adminProcedure
		.input(createPricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			await requireRoom(ctx.db, input.roomId);
			rejectPastDate(input.endDate, 'End date');

			const id = newId();
			const now = new Date();
			const ts = nowSeconds(now);
			const active = input.isActive ?? true;
			const guard = active
				? sql`NOT EXISTS (
						SELECT 1 FROM room_pricing_rules AS r
						WHERE r.room_id = ${input.roomId}
							AND r.is_active = 1
							AND r.start_date <= ${input.endDate}
							AND ${input.startDate} <= r.end_date
					)`
				: sql`1 = 1`;
			const result = await ctx.db.run(sql`
				INSERT INTO room_pricing_rules (
					id, room_id, name, rule_type, value, start_date, end_date,
					is_active, activated_at, created_at, updated_at
				)
				SELECT ${id}, ${input.roomId}, ${input.name}, ${input.ruleType},
					${input.value}, ${input.startDate}, ${input.endDate},
					${active ? 1 : 0}, ${active ? ts : null}, ${ts}, ${ts}
				WHERE ${guard}`);

			if (!result.meta.changes) {
				const overlapping = await findOverlappingRule(
					ctx.db,
					input.roomId,
					input.startDate,
					input.endDate,
				);
				if (overlapping) throw overlapError(overlapping);
				throw new TRPCError({
					code: 'CONFLICT',
					message: 'The rule could not be saved. Please try again.',
				});
			}
			const [created] = await ctx.db
				.select()
				.from(roomPricingRules)
				.where(eq(roomPricingRules.id, id));
			return created;
		}),

	/**
	 * Updates a rule. If the result is active (including reactivation), it is
	 * re-checked against the room's other active rules in the same statement.
	 */
	updatePricingRule: adminProcedure
		.input(updatePricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...changes } = input;
			const [current] = await ctx.db
				.select()
				.from(roomPricingRules)
				.where(eq(roomPricingRules.id, id));
			if (!current) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Pricing rule not found',
				});
			}
			const startDate = changes.startDate ?? current.startDate;
			const endDate = changes.endDate ?? current.endDate;
			if (startDate > endDate) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'End date must be on or after the start date',
				});
			}
			if (changes.endDate && changes.endDate !== current.endDate) {
				rejectPastDate(changes.endDate, 'End date');
			}
			const active = changes.isActive ?? current.isActive ?? false;
			const reactivated = active && !current.isActive;
			const now = new Date();

			const other = alias(roomPricingRules, 'other');
			const noOverlap = notExists(
				ctx.db
					.select({ one: sql`1` })
					.from(other)
					.where(
						and(
							eq(other.roomId, current.roomId),
							ne(other.id, id),
							eq(other.isActive, true),
							lte(other.startDate, endDate),
							gte(other.endDate, startDate),
						),
					),
			);

			const [updated] = await ctx.db
				.update(roomPricingRules)
				.set({
					...changes,
					isActive: active,
					activatedAt: reactivated ? now : current.activatedAt,
					updatedAt: now,
				})
				.where(and(eq(roomPricingRules.id, id), active ? noOverlap : undefined))
				.returning();

			if (!updated) {
				const overlapping = await findOverlappingRule(
					ctx.db,
					current.roomId,
					startDate,
					endDate,
					id,
				);
				if (overlapping) throw overlapError(overlapping);
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Pricing rule not found',
				});
			}
			return updated;
		}),

	deletePricingRule: adminProcedure
		.input(deletePricingRuleSchema)
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.delete(roomPricingRules)
				.where(eq(roomPricingRules.id, input.id))
				.returning();
			if (!deleted) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Pricing rule not found',
				});
			}
			return { success: true, deletedRule: deleted };
		}),

	// --- Blocked periods (admin; inclusive dates) ------------------------------

	getBlockedPeriods: adminProcedure
		.input(getBlockedPeriodsSchema)
		.query(async ({ ctx, input }) => {
			const conditions = [];
			if (input.roomId) {
				conditions.push(eq(roomBlockedPeriods.roomId, input.roomId));
			}
			if (input.startDate) {
				conditions.push(gte(roomBlockedPeriods.endDate, input.startDate));
			}
			if (input.endDate) {
				conditions.push(lte(roomBlockedPeriods.startDate, input.endDate));
			}
			return ctx.db
				.select()
				.from(roomBlockedPeriods)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(asc(roomBlockedPeriods.startDate))
				.limit(input.limit)
				.offset(input.offset);
		}),

	/**
	 * Blocks dates. Rejected with CONFLICT (data.conflicts) if the block would
	 * cover a confirmed booking, a live hold or an imported reservation, or
	 * overlap another block.
	 */
	createBlockedPeriod: adminProcedure
		.input(createBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			await requireRoom(ctx.db, input.roomId);
			await assertBlockAllowed(
				ctx.db,
				input.roomId,
				input.startDate,
				input.endDate,
			);
			// The check above gives the friendly error; this insert re-checks
			// atomically (a booking or import may have arrived in between).
			const id = newId();
			const now = new Date();
			const result = await ctx.db.run(sql`
				INSERT INTO room_blocked_periods
					(id, room_id, start_date, end_date, reason, notes, created_at)
				SELECT ${id}, ${input.roomId}, ${input.startDate}, ${input.endDate},
					${input.reason}, ${input.notes || null}, ${Math.floor(now.getTime() / 1000)}
				WHERE ${blockIsFree(input.roomId, input.startDate, input.endDate, now)}`);
			if (!result.meta.changes) throw blockChanged();
			const [created] = await ctx.db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, id));
			return created;
		}),

	updateBlockedPeriod: adminProcedure
		.input(updateBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			const [existing] = await ctx.db
				.select()
				.from(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id));
			if (!existing) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Blocked period not found',
				});
			}
			const startDate = input.startDate ?? existing.startDate;
			const endDate = input.endDate ?? existing.endDate;
			if (startDate > endDate) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'End date must be on or after the start date',
				});
			}
			if (startDate !== existing.startDate || endDate !== existing.endDate) {
				await assertBlockAllowed(
					ctx.db,
					existing.roomId,
					startDate,
					endDate,
					existing.id,
				);
			}
			const datesChanged =
				startDate !== existing.startDate || endDate !== existing.endDate;
			const [updated] = await ctx.db
				.update(roomBlockedPeriods)
				.set({
					startDate,
					endDate,
					...(input.reason ? { reason: input.reason } : {}),
					...(input.notes !== undefined ? { notes: input.notes || null } : {}),
				})
				.where(
					and(
						eq(roomBlockedPeriods.id, input.id),
						datesChanged
							? blockIsFree(
									existing.roomId,
									startDate,
									endDate,
									new Date(),
									existing.id,
								)
							: undefined,
					),
				)
				.returning();
			if (!updated) throw blockChanged();
			return updated;
		}),

	deleteBlockedPeriod: adminProcedure
		.input(deleteBlockedPeriodSchema)
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.delete(roomBlockedPeriods)
				.where(eq(roomBlockedPeriods.id, input.id))
				.returning({ id: roomBlockedPeriods.id });
			if (!deleted) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Blocked period not found',
				});
			}
			return { success: true, id: deleted.id };
		}),
});

const blockChanged = () =>
	new TRPCError({
		code: 'CONFLICT',
		message:
			'A reservation or block was added for these dates just now. Please reload and try again.',
	});

async function assertBlockAllowed(
	db: Database,
	roomId: string,
	startDate: string,
	endDate: string,
	excludeBlockId?: string,
) {
	const conflicts = await findBlockConflicts(db, roomId, startDate, endDate);
	if (conflicts.length > 0) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: `These dates overlap ${conflicts.length} existing reservation${conflicts.length === 1 ? '' : 's'}`,
			cause: { conflicts },
		});
	}
	const blocks = await db
		.select()
		.from(roomBlockedPeriods)
		.where(
			and(
				eq(roomBlockedPeriods.roomId, roomId),
				lte(roomBlockedPeriods.startDate, endDate),
				gte(roomBlockedPeriods.endDate, startDate),
				excludeBlockId ? ne(roomBlockedPeriods.id, excludeBlockId) : undefined,
			),
		);
	const overlapping = blocks.find((b) =>
		inclusiveRangesOverlap(
			{ start: b.startDate, end: b.endDate },
			{ start: startDate, end: endDate },
		),
	);
	if (overlapping) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: `Overlaps the blocked period ${overlapping.startDate} to ${overlapping.endDate} (${overlapping.reason})`,
			cause: {
				conflicts: [
					{
						publicId: null,
						confirmationId: null,
						source: 'block',
						checkIn: overlapping.startDate,
						checkOut: overlapping.endDate,
						status: 'blocked',
					},
				],
			},
		});
	}
}
