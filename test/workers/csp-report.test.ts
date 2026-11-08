import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { MAX_REPORT_BODY_BYTES } from '@/lib/csp-report';

import { fetchWorker } from './helpers';

// POST /api/csp-report logs summaries to Workers Logs and stores nothing.

const post = (body: string, type: string) =>
	fetchWorker(
		new Request('https://example.test/api/csp-report', {
			method: 'POST',
			headers: { 'Content-Type': type },
			body,
		}),
	);

afterEach(() => {
	vi.restoreAllMocks();
});

describe('POST /api/csp-report', () => {
	it('logs one structured line per violation and answers 204', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const response = await post(
			JSON.stringify({
				'csp-report': {
					'document-uri': 'https://example.test/account?email=a%40b.test',
					'effective-directive': 'connect-src',
					'blocked-uri': 'https://tracker.example/collect?id=1',
					disposition: 'report',
				},
			}),
			'application/csp-report',
		);
		expect(response.status).toBe(204);
		expect(warn).toHaveBeenCalledTimes(1);
		const line = String(warn.mock.calls[0][0]);
		expect(JSON.parse(line)).toEqual({
			message: 'csp-violation',
			directive: 'connect-src',
			blocked: 'https://tracker.example',
			documentPath: '/account',
			disposition: 'report',
		});
		expect(line).not.toContain('a%40b.test');
	});

	it('rejects other content types, bad JSON and oversized bodies', async () => {
		expect((await post('{}', 'text/plain')).status).toBe(415);
		expect((await post('{nope', 'application/reports+json')).status).toBe(400);
		expect(
			(
				await post(
					'x'.repeat(MAX_REPORT_BODY_BYTES + 1),
					'application/reports+json',
				)
			).status,
		).toBe(413);
	});
});
