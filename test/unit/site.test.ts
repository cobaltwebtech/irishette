import { describe, expect, it } from 'vite-plus/test';

import {
	CHECK_IN_TIME,
	CHECK_IN_TIME_LABEL,
	CHECK_OUT_TIME,
	CHECK_OUT_TIME_LABEL,
	SAME_DAY_CUTOFF_LABEL,
	CONTACT_PHONE,
	CONTACT_PHONE_E164,
	CONTACT_PHONE_HREF,
	formatPhoneDisplay,
	formatTimeOfDay,
	PROPERTY_TIMEZONE,
} from '@/lib/site';

describe('site constants', () => {
	it('uses the decided property times', () => {
		expect(PROPERTY_TIMEZONE).toBe('America/Chicago');
		expect(CHECK_IN_TIME).toBe('16:00');
		expect(CHECK_OUT_TIME).toBe('11:00');
		expect(CHECK_IN_TIME_LABEL).toBe('4:00 PM CT');
		expect(CHECK_OUT_TIME_LABEL).toBe('11:00 AM CT');
		expect(SAME_DAY_CUTOFF_LABEL).toBe('9:00 AM CT');
	});

	it('shows the phone as 254-454-5558 and links the full international number', () => {
		expect(CONTACT_PHONE).toBe('254-454-5558');
		expect(CONTACT_PHONE_E164).toBe('+12544545558');
		expect(CONTACT_PHONE_HREF).toBe('tel:+12544545558');
	});

	it('formats US numbers and leaves other numbers unchanged', () => {
		expect(formatPhoneDisplay('+12125550123')).toBe('212-555-0123');
		expect(formatPhoneDisplay('+442071838750')).toBe('+442071838750');
	});
});

describe('formatTimeOfDay', () => {
	it.each([
		['00:00', '12:00 AM'],
		['09:00', '9:00 AM'],
		['11:00', '11:00 AM'],
		['12:00', '12:00 PM'],
		['16:00', '4:00 PM'],
		['23:05', '11:05 PM'],
	])('%s -> %s', (time, label) => {
		expect(formatTimeOfDay(time)).toBe(label);
	});

	it('adds the zone label on request', () => {
		expect(formatTimeOfDay('16:00', { withZone: true })).toBe('4:00 PM CT');
	});
});
