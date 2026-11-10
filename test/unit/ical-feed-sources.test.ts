import { describe, expect, it } from 'vite-plus/test';

import { nextIcalSyncAt } from '@/lib/ical/ical-feed-sources';

describe('nextIcalSyncAt', () => {
	it('rounds up to the next :00 or :30 (UTC)', () => {
		expect(nextIcalSyncAt(new Date('2026-11-10T03:12:45Z')).toISOString()).toBe(
			'2026-11-10T03:30:00.000Z',
		);
		expect(nextIcalSyncAt(new Date('2026-11-10T03:45:00Z')).toISOString()).toBe(
			'2026-11-10T04:00:00.000Z',
		);
	});

	it('is strictly after a run time', () => {
		expect(nextIcalSyncAt(new Date('2026-11-10T03:00:00Z')).toISOString()).toBe(
			'2026-11-10T03:30:00.000Z',
		);
	});
});
