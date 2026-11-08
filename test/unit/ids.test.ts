import { describe, expect, it } from 'vite-plus/test';

import {
	idSchema,
	newIcalExportToken,
	newId,
	newPublicId,
	publicIdSchema,
} from '@/lib/ids';

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId (UUIDv7)', () => {
	it('is a lowercase UUIDv7', () => {
		expect(newId()).toMatch(UUID_V7);
	});

	it('increases monotonically, so ids sort by creation time', () => {
		const ids = Array.from({ length: 200 }, () => newId());
		expect([...ids].sort()).toEqual(ids);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('idSchema', () => {
	it('accepts newId() and rejects other strings', () => {
		expect(idSchema.safeParse(newId()).success).toBe(true);
		expect(
			idSchema.safeParse('019a5f00-0000-7000-8000-000000000001').success,
		).toBe(true);
		for (const bad of ['', 'abc', newPublicId(), crypto.randomUUID()]) {
			expect(idSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe('newPublicId', () => {
	it('is 16 chars of [0-9a-z]', () => {
		for (let i = 0; i < 100; i++) {
			expect(newPublicId()).toMatch(/^[0-9a-z]{16}$/);
		}
	});

	it('passes publicIdSchema', () => {
		expect(publicIdSchema.safeParse(newPublicId()).success).toBe(true);
	});
});

describe('newIcalExportToken', () => {
	it('is 43 chars of base64url (32 random bytes)', () => {
		const token = newIcalExportToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(newIcalExportToken()).not.toBe(token);
	});
});
