import { describe, expect, it } from 'vite-plus/test';

import {
	CHECK_IN_TIME,
	CHECK_OUT_TIME,
	CHECK_OUT_TIME_LABEL,
	CONTACT_PHONE,
	CONTACT_PHONE_HREF,
	formatTimeOfDay,
	PROPERTY_TIMEZONE,
} from '@/lib/site';

describe('site constants', () => {
	it('uses the decided property times', () => {
		expect(PROPERTY_TIMEZONE).toBe('America/Chicago');
		expect(CHECK_IN_TIME).toBe('16:00');
		expect(CHECK_OUT_TIME).toBe('11:00');
		expect(CHECK_OUT_TIME_LABEL).toBe('11:00 AM');
	});

	it('keeps the tel: link in sync with the displayed phone digits', () => {
		const digits = CONTACT_PHONE.replaceAll(/\D/g, '');
		expect(CONTACT_PHONE_HREF.replaceAll(/\D/g, '')).toContain(digits);
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
