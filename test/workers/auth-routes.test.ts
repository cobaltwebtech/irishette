import { describe, expect, it } from 'vite-plus/test';

import { auth } from '@/lib/auth/auth';

// Requests go straight to the Better Auth handler (no Cloudflare rate-limit
// binding in front), each from its own IP so Better Auth's D1 limits from
// other tests don't interfere.

const BASE = 'http://localhost:3000/api/auth';

async function post(path: string, body: unknown, ip: string) {
	const authInstance = await auth();
	return authInstance.handler(
		new Request(`${BASE}${path}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				'cf-connecting-ip': ip,
			},
			body: JSON.stringify(body),
		}),
	);
}

describe('Better Auth routes', () => {
	it('the phone-number plugin is gone (plan 02 Phase 2)', async () => {
		const signIn = await post(
			'/sign-in/phone-number',
			{ phoneNumber: '5555550142', password: 'Password123' },
			'192.0.2.30',
		);
		expect(signIn.status).toBe(404);
		const sendOtp = await post(
			'/phone-number/send-otp',
			{ phoneNumber: '5555550142' },
			'192.0.2.31',
		);
		expect(sendOtp.status).toBe(404);
	});

	it('the Stripe plugin webhook is disabled (subscriptions only; no secret)', async () => {
		const authInstance = await auth();
		const response = await authInstance.handler(
			new Request(`${BASE}/stripe/webhook`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'stripe-signature': 't=1,v1=bad',
					'cf-connecting-ip': '192.0.2.33',
				},
				body: JSON.stringify({ type: 'checkout.session.completed' }),
			}),
		);
		expect(response.status).toBe(404);
	});

	it('resending a verification email needs a Turnstile token', async () => {
		const response = await post(
			'/send-verification-email',
			{ email: 'nobody@example.test' },
			'192.0.2.32',
		);
		expect(response.status).toBe(400);
		const body: { code?: string } = await response.json();
		expect(body.code).toBe('MISSING_RESPONSE');
	});
});
