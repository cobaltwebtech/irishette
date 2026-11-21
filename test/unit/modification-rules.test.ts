import { describe, expect, it } from 'vite-plus/test';

import {
	changeError,
	differenceInCents,
	modifiableError,
	modificationKind,
	releaseEarlyError,
} from '@/lib/booking/modification-rules';

// Admin reservation changes (plan 06): no shortening, no past check-in
// unless unchanged, release early within the stay, signed difference.

const current = {
	roomId: 'rose',
	checkIn: '2030-06-10',
	checkOut: '2030-06-12',
};
const today = '2030-06-11';

describe('changeError', () => {
	it.each([
		[
			'extend an in-progress stay',
			{ ...current, checkOut: '2030-06-13' },
			null,
		],
		[
			'move to later dates, same nights',
			{ ...current, checkIn: '2030-06-20', checkOut: '2030-06-22' },
			null,
		],
		['change the room only', { ...current, roomId: 'texas' }, null],
		['nothing changes', current, /Nothing to change/],
		[
			'shorten',
			{ ...current, checkOut: '2030-06-11' },
			/cannot shorten the stay \(now 2 nights\)/,
		],
		[
			'move check-in into the past',
			{ ...current, checkIn: '2030-06-09', checkOut: '2030-06-12' },
			/past/,
		],
		[
			'check-out before check-in',
			{ ...current, checkIn: '2030-06-20', checkOut: '2030-06-19' },
			/after check-in/,
		],
	])('%s', (_label, next, expected) => {
		const error = changeError(current, next, today);
		if (expected === null) expect(error).toBeNull();
		else expect(error).toMatch(expected);
	});
});

describe('releaseEarlyError', () => {
	it.each([
		['one night earlier', '2030-06-11', null],
		['not earlier', '2030-06-12', /before the current check-out/],
		['no night left', '2030-06-10', /at least one night/],
	])('%s', (_label, newCheckOut, expected) => {
		const error = releaseEarlyError(current, newCheckOut, '2030-06-10');
		if (expected === null) expect(error).toBeNull();
		else expect(error).toMatch(expected);
	});

	it('not in the past', () => {
		const stay = { checkIn: '2030-06-01', checkOut: '2030-06-10' };
		expect(releaseEarlyError(stay, '2030-06-05', '2030-06-07')).toMatch(/past/);
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
