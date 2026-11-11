import { describe, expect, it } from 'vite-plus/test';

import { formatInstantIso } from '@/utils/timezone';

describe('formatInstantIso', () => {
	it('writes the property-local time with its UTC offset', () => {
		// Summer: CDT (UTC-5). Winter: CST (UTC-6).
		expect(formatInstantIso(new Date('2030-06-10T21:00:00Z'))).toBe(
			'2030-06-10T16:00:00-05:00',
		);
		expect(formatInstantIso(new Date('2030-12-10T22:00:00Z'))).toBe(
			'2030-12-10T16:00:00-06:00',
		);
	});

	it('uses the local date when it differs from the UTC date', () => {
		expect(formatInstantIso(new Date('2030-06-11T02:30:00Z'))).toBe(
			'2030-06-10T21:30:00-05:00',
		);
	});

	it('supports other zones, including half-hour offsets', () => {
		expect(
			formatInstantIso(new Date('2030-06-10T00:00:00Z'), 'Asia/Kolkata'),
		).toBe('2030-06-10T05:30:00+05:30');
	});
});
