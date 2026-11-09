import { describe, expect, it } from 'vite-plus/test';

import { rateLimit } from '@/db/schema-export';
import { AUTH_RATE_LIMIT_RULES, auth } from '@/lib/auth';

import { db } from './helpers';

// Better Auth keeps its rate limits in D1 (rateLimit.storage: 'database'), so
// they hold across isolates. Requests go straight to the Better Auth handler.

const BASE = 'http://localhost:3000/api/auth';

async function sendVerification(ip: string) {
	const authInstance = await auth();
	return authInstance.handler(
		new Request(`${BASE}/send-verification-email`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				'cf-connecting-ip': ip,
			},
			body: JSON.stringify({ email: 'nobody@example.test' }),
		}),
	);
}

describe('Better Auth rate limit (D1 storage)', () => {
	it('rejects requests over the rule and stores counts in rate_limit', async () => {
		const { max } = AUTH_RATE_LIMIT_RULES['/send-verification-email'];
		const statuses: number[] = [];
		for (let i = 0; i <= max; i++) {
			statuses.push((await sendVerification('192.0.2.10')).status);
		}
		expect(statuses.slice(0, max).every((s) => s !== 429)).toBe(true);
		expect(statuses[max]).toBe(429);

		const rows = await db().select().from(rateLimit);
		expect(rows.some((r) => r.key.includes('192.0.2.10'))).toBe(true);
	});

	it('counts each IP separately', async () => {
		const response = await sendVerification('192.0.2.11');
		expect(response.status).not.toBe(429);
	});
});
