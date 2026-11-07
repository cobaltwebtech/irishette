#!/usr/bin/env node
// Smoke test against a running dev server (pnpm dev).
// Usage: pnpm test:smoke            (BASE_URL defaults to http://localhost:3000)
//        BASE_URL=http://localhost:8787 pnpm test:smoke
// Plain fetch, logged out. Prints a table, exits 1 on any unexpected result.

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
	/\/$/,
	'',
);

// Seeded room id from scripts/seed-local.sql (current iCal route shape: /api/ical/<room id>.ics).
const SEED_ROOM_ID = '019a5f00-0000-7000-8000-000000000001';

const isRedirect = (status) => status >= 300 && status < 400;

/** @type {{ name: string, path: string, expect: string, check: (r: { status: number, location: string | null, contentType: string, body: string }) => boolean }[]} */
const checks = [
	{
		name: 'home',
		path: '/',
		expect: '200 html',
		check: (r) => r.status === 200 && r.contentType.includes('text/html'),
	},
	{
		name: 'rose room',
		path: '/rooms/rose-room',
		expect: '200 html',
		check: (r) => r.status === 200 && r.contentType.includes('text/html'),
	},
	{
		name: 'texas room',
		path: '/rooms/texas-room',
		expect: '200 html',
		check: (r) => r.status === 200 && r.contentType.includes('text/html'),
	},
	{
		name: 'admin (logged out)',
		path: '/admin',
		expect: '3xx redirect',
		check: (r) => isRedirect(r.status) && !!r.location,
	},
	{
		name: 'account (logged out)',
		path: '/account',
		expect: '3xx redirect',
		check: (r) => isRedirect(r.status) && !!r.location,
	},
	{
		name: 'ical export',
		path: `/api/ical/${SEED_ROOM_ID}.ics`,
		expect: '200 text/calendar',
		check: (r) =>
			r.status === 200 &&
			r.contentType.includes('text/calendar') &&
			r.body.includes('BEGIN:VCALENDAR'),
	},
	{
		name: 'trpc rooms.ping',
		path: '/api/trpc/rooms.ping',
		expect: '200 json',
		check: (r) => r.status === 200 && r.contentType.includes('json'),
	},
];

const rows = [];
let failures = 0;

for (const c of checks) {
	const url = `${BASE_URL}${c.path}`;
	let result;
	try {
		const res = await fetch(url, {
			redirect: 'manual',
			signal: AbortSignal.timeout(30_000),
		});
		result = {
			status: res.status,
			location: res.headers.get('location'),
			contentType: res.headers.get('content-type') ?? '',
			body: await res.text(),
		};
	} catch (error) {
		result = {
			status: 0,
			location: null,
			contentType: '',
			body: String(error instanceof Error ? error.message : error),
		};
	}

	const ok = c.check(result);
	if (!ok) failures++;

	rows.push({
		check: c.name,
		path: c.path,
		expect: c.expect,
		status: result.status,
		location: result.location ?? '',
		result: ok ? 'ok' : 'FAIL',
	});
}

console.log(`Smoke test against ${BASE_URL}`);
console.table(rows);

if (failures > 0) {
	console.error(`${failures} check(s) failed.`);
	process.exit(1);
}
console.log('All checks passed.');
