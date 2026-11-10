import { describe, expect, it } from 'vite-plus/test';

import { parseCspReports } from '@/lib/security/csp-report';
import {
	CSP_REPORT_PATH,
	contentSecurityPolicy,
	securityHeadersFor,
	withHeaders,
} from '@/lib/security/security-headers';

function directive(policy: string, name: string): string[] {
	const found = policy
		.split(';')
		.map((d) => d.trim().split(/\s+/))
		.find(([n]) => n === name);
	return found ? found.slice(1) : [];
}

describe('contentSecurityPolicy', () => {
	const policy = contentSecurityPolicy();

	it('allows Stripe.js, the Payment Element frames and Turnstile', () => {
		expect(directive(policy, 'script-src')).toEqual(
			expect.arrayContaining([
				'https://js.stripe.com',
				'https://*.js.stripe.com',
				'https://challenges.cloudflare.com',
			]),
		);
		expect(directive(policy, 'frame-src')).toEqual(
			expect.arrayContaining([
				'https://js.stripe.com',
				'https://hooks.stripe.com',
				'https://challenges.cloudflare.com',
			]),
		);
		expect(directive(policy, 'connect-src')).toContain(
			'https://api.stripe.com',
		);
	});

	it('locks down framing, plugins and the base URL, and reports', () => {
		expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
		expect(directive(policy, 'object-src')).toEqual(["'none'"]);
		expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
		expect(directive(policy, 'report-uri')).toEqual([CSP_REPORT_PATH]);
	});

	it('only allows the Vite WebSocket in dev', () => {
		expect(directive(policy, 'connect-src')).not.toContain('ws:');
		expect(
			directive(contentSecurityPolicy({ dev: true }), 'connect-src'),
		).toContain('ws:');
	});
});

describe('securityHeadersFor', () => {
	it('pages get the report-only CSP and the reporting endpoint', () => {
		const headers = securityHeadersFor(new URL('https://example.test/rooms'));
		expect(headers).toMatchObject({
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
			'X-Frame-Options': 'DENY',
			'Reporting-Endpoints': `csp-endpoint="https://example.test${CSP_REPORT_PATH}"`,
		});
		expect(headers['Content-Security-Policy-Report-Only']).toBeTruthy();
		expect(headers).not.toHaveProperty('Content-Security-Policy');
	});

	it('API responses get the basic headers but no CSP', () => {
		const headers = securityHeadersFor(
			new URL('https://example.test/api/ical/x.ics'),
		);
		expect(headers['X-Content-Type-Options']).toBe('nosniff');
		expect(headers).not.toHaveProperty('Content-Security-Policy-Report-Only');
	});
});

describe('withHeaders', () => {
	it('keeps headers the response already set', () => {
		const response = withHeaders(
			new Response('x', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }),
			{ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' },
		);
		expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('copies a response whose headers are immutable', async () => {
		const original = Response.redirect('https://example.test/next', 302);
		const response = withHeaders(original, { 'X-Frame-Options': 'DENY' });
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://example.test/next');
	});
});

describe('parseCspReports', () => {
	it('summarizes report-uri bodies without query strings or full URLs', () => {
		expect(
			parseCspReports({
				'csp-report': {
					'document-uri':
						'https://example.test/booking/confirmation/abc?session_id=secret#x',
					'effective-directive': 'script-src-elem',
					'blocked-uri': 'https://evil.example/path/script.js?token=1',
					disposition: 'report',
					'script-sample': 'alert(document.cookie)',
				},
			}),
		).toEqual([
			{
				directive: 'script-src-elem',
				blocked: 'https://evil.example',
				documentPath: '/booking/confirmation/abc',
				disposition: 'report',
			},
		]);
	});

	it('summarizes Reporting API batches and ignores other report types', () => {
		const reports = parseCspReports([
			{
				type: 'csp-violation',
				url: 'https://example.test/rooms/rose-room?x=1',
				body: {
					documentURL: 'https://example.test/rooms/rose-room?x=1',
					effectiveDirective: 'img-src',
					blockedURL: 'inline',
					disposition: 'report',
				},
			},
			{ type: 'deprecation', body: {} },
		]);
		expect(reports).toEqual([
			{
				directive: 'img-src',
				blocked: 'inline',
				documentPath: '/rooms/rose-room',
				disposition: 'report',
			},
		]);
	});

	it('caps the batch and ignores unknown bodies', () => {
		const many = Array.from({ length: 50 }, () => ({
			type: 'csp-violation',
			body: { documentURL: 'https://example.test/' },
		}));
		expect(parseCspReports(many)).toHaveLength(10);
		expect(parseCspReports('nope')).toEqual([]);
		expect(parseCspReports({ other: 1 })).toEqual([]);
	});
});
