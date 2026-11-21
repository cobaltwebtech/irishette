import { describe, expect, it } from 'vite-plus/test';

import {
	amountsAfterPolicyRefund,
	changeError,
	differenceInCents,
	modifiableError,
	modificationKind,
	releaseEarlyError,
} from '@/lib/booking/modification-rules';

// Admin reservation changes (plan 06): before the stay begins any length
// (shortening included) with no past check-in; once begun only a later
// check-out; release early only for a stay that has begun.

const current = {
	roomId: 'rose',
	checkIn: '2030-06-10',
	checkOut: '2030-06-13',
};

describe('changeError before the stay begins', () => {
	const today = '2030-06-08';
	it.each([
		['extend', { ...current, checkOut: '2030-06-14' }, null],
		[
			'shorten (repriced, refunded)',
			{ ...current, checkOut: '2030-06-11' },
			null,
		],
		[
			'move to later dates with fewer nights',
			{ ...current, checkIn: '2030-06-20', checkOut: '2030-06-21' },
			null,
		],
		['change the room only', { ...current, roomId: 'texas' }, null],
		['nothing changes', current, /Nothing to change/],
		[
			'move check-in into the past',
			{ ...current, checkIn: '2030-06-07', checkOut: '2030-06-09' },
			/past/,
		],
		[
			'check-out before check-in',
			{ ...current, checkIn: '2030-06-20', checkOut: '2030-06-19' },
			/after check-in/,
		],
	])('%s', (_label, next, expected) => {
		const error = changeError(current, next, today, { stayBegun: false });
		if (expected === null) expect(error).toBeNull();
		else expect(error).toMatch(expected);
	});
});

describe('changeError once the stay has begun', () => {
	const today = '2030-06-11';
	it.each([
		['extend', { ...current, checkOut: '2030-06-14' }, null],
		['change the room, same dates', { ...current, roomId: 'texas' }, null],
		[
			'shorten',
			{ ...current, checkOut: '2030-06-12' },
			/release the room instead \(no refund\)/,
		],
		[
			'move the check-in',
			{ ...current, checkIn: '2030-06-12', checkOut: '2030-06-15' },
			/check-in cannot change/,
		],
	])('%s', (_label, next, expected) => {
		const error = changeError(current, next, today, { stayBegun: true });
		if (expected === null) expect(error).toBeNull();
		else expect(error).toMatch(expected);
	});
});

describe('releaseEarlyError', () => {
	const begun = { stayBegun: true };
	it.each([
		['one night earlier', '2030-06-12', null],
		['from today', '2030-06-11', null],
		['not earlier', '2030-06-13', /before the current check-out/],
		['no night left', '2030-06-10', /at least one night/],
	])('%s', (_label, newCheckOut, expected) => {
		const error = releaseEarlyError(current, newCheckOut, '2030-06-11', begun);
		if (expected === null) expect(error).toBeNull();
		else expect(error).toMatch(expected);
	});

	it('not in the past', () => {
		const stay = { checkIn: '2030-06-01', checkOut: '2030-06-10' };
		expect(releaseEarlyError(stay, '2030-06-05', '2030-06-07', begun)).toMatch(
			/past/,
		);
	});

	it('not before the stay begins (shorten it as a change instead)', () => {
		expect(
			releaseEarlyError(current, '2030-06-12', '2030-06-08', {
				stayBegun: false,
			}),
		).toMatch(/change the dates instead/);
	});
});

describe('modificationKind and modifiableError', () => {
	it('names the change', () => {
		expect(modificationKind(current, { ...current, roomId: 'texas' })).toBe(
			'change_room',
		);
		expect(
			modificationKind(current, { ...current, checkOut: '2030-06-14' }),
		).toBe('extend');
		expect(
			modificationKind(current, { ...current, checkOut: '2030-06-11' }),
		).toBe('shorten');
		expect(
			modificationKind(current, {
				...current,
				checkIn: '2030-07-01',
				checkOut: '2030-07-03',
			}),
		).toBe('move');
	});

	it('only confirmed, paid bookings can change', () => {
		expect(
			modifiableError({ status: 'confirmed', paymentStatus: 'paid' }),
		).toBeNull();
		expect(
			modifiableError({
				status: 'confirmed',
				paymentStatus: 'partially_refunded',
			}),
		).toBeNull();
		expect(
			modifiableError({ status: 'pending', paymentStatus: 'pending' }),
		).toMatch(/confirmed/);
		expect(
			modifiableError({ status: 'confirmed', paymentStatus: 'authorized' }),
		).toMatch(/still being completed/);
		expect(
			modifiableError({ status: 'confirmed', paymentStatus: 'refund_failed' }),
		).toMatch(/refund/);
	});

	it('differences are signed cents without float drift', () => {
		expect(differenceInCents(253.12, 250)).toBe(312);
		expect(differenceInCents(200.1, 200.3)).toBe(-20);
	});
});

describe('amountsAfterPolicyRefund (fewer nights under the cancellation policy)', () => {
	// Two nights at $253.12 down to one at $126.56 (difference $126.56).
	const current = {
		baseAmount: 200,
		feesAmount: 24,
		taxAmount: 29.12,
		totalAmount: 253.12,
		taxableAmount: 224,
		stateTaxAmount: 13.44,
		cityTaxAmount: 15.68,
	};
	const next = {
		baseAmount: 100,
		feesAmount: 12,
		taxAmount: 14.56,
		totalAmount: 126.56,
		taxableAmount: 112,
		stateTaxAmount: 6.72,
		cityTaxAmount: 7.84,
	};

	it('100% refunds the whole difference: the new stay price', () => {
		const r = amountsAfterPolicyRefund(current, next, 100);
		expect(r).toMatchObject({ refundCents: 12656, keptCents: 0 });
		expect(r.amounts).toEqual(next);
	});

	it('75% keeps a quarter of each part, total = old total - refund', () => {
		const r = amountsAfterPolicyRefund(current, next, 75);
		expect(r.refundCents).toBe(9492);
		expect(r.keptCents).toBe(3164);
		expect(r.amounts.totalAmount).toBe(158.2);
		expect(r.amounts.baseAmount).toBe(125);
		expect(r.amounts.taxAmount).toBe(18.2);
		const parts =
			r.amounts.baseAmount + r.amounts.feesAmount + r.amounts.taxAmount;
		expect(Math.round(parts * 100)).toBe(15820);
	});

	it('0% refunds nothing and keeps the amounts', () => {
		const r = amountsAfterPolicyRefund(current, next, 0);
		expect(r.refundCents).toBe(0);
		expect(r.amounts).toEqual(current);
	});
});
