import { describe, expect, it } from 'vite-plus/test';

import {
	ARRIVAL_WINDOW_OPTIONS,
	arrivalWindowLabel,
	storedArrivalLabel,
} from '@/lib/booking/arrival-windows';

describe('arrival windows', () => {
	it('offers hourly windows from 1:00 PM, then "after 11:00 PM"', () => {
		expect(ARRIVAL_WINDOW_OPTIONS.map((o) => o.label)).toEqual([
			'1:00 PM - 2:00 PM',
			'2:00 PM - 3:00 PM',
			'3:00 PM - 4:00 PM',
			'4:00 PM - 5:00 PM',
			'5:00 PM - 6:00 PM',
			'6:00 PM - 7:00 PM',
			'7:00 PM - 8:00 PM',
			'8:00 PM - 9:00 PM',
			'9:00 PM - 10:00 PM',
			'10:00 PM - 11:00 PM',
			'After 11:00 PM',
		]);
		expect(ARRIVAL_WINDOW_OPTIONS[0].value).toBe('13:00');
	});

	it('labels a window by its start', () => {
		expect(arrivalWindowLabel('16:00')).toBe('4:00 PM - 5:00 PM');
		expect(arrivalWindowLabel('23:00')).toBe('After 11:00 PM');
	});

	it('labels stored values and ignores missing or unknown ones', () => {
		expect(storedArrivalLabel('18:00')).toBe('6:00 PM - 7:00 PM');
		expect(storedArrivalLabel(null)).toBeNull();
		expect(storedArrivalLabel('18:30')).toBeNull();
	});
});
