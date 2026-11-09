import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { contactSchema } from '@/lib/contact-validation';
import { contactReplyHref } from '@/lib/inbox';
import {
	decodeInboxCursor,
	encodeInboxCursor,
	inboxSearchSchema,
} from '@/lib/inbox-validation';

// The contact form schema, the dashboard's mailto reply link, inbox cursors
// and the wiring of rateLimitFnMiddleware (Start helpers and the limiter are
// mocked: no request and no Worker bindings in Node).

const valid = {
	name: 'Casey Guest',
	email: 'casey@example.test',
	subject: 'Late arrival',
	message: 'We will arrive around 10 PM.',
	turnstileToken: 'token',
};

const issuePaths = (input: unknown) => {
	const result = contactSchema.safeParse(input);
	return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('contactSchema', () => {
	it('accepts a minimal message and treats blank optionals as absent', () => {
		const parsed = contactSchema.parse({
			...valid,
			phone: '  ',
			bookingConfirmationId: '',
		});
		expect(parsed.phone).toBeUndefined();
		expect(parsed.bookingConfirmationId).toBeUndefined();
	});

	it('rejects line breaks in the subject (it becomes an email subject)', () => {
		expect(issuePaths({ ...valid, subject: 'Hi\r\nBcc: x@y.z' })).toEqual([
			'subject',
		]);
		expect(issuePaths({ ...valid, subject: 'Hi\nthere' })).toEqual(['subject']);
	});

	it('checks lengths', () => {
		expect(issuePaths({ ...valid, name: 'A' })).toEqual(['name']);
		expect(issuePaths({ ...valid, name: 'A'.repeat(101) })).toEqual(['name']);
		expect(issuePaths({ ...valid, subject: 'S'.repeat(151) })).toEqual([
			'subject',
		]);
		expect(issuePaths({ ...valid, message: 'too short' })).toEqual(['message']);
		expect(issuePaths({ ...valid, message: 'M'.repeat(5001) })).toEqual([
			'message',
		]);
		expect(issuePaths({ ...valid, turnstileToken: '' })).toEqual([
			'turnstileToken',
		]);
	});

	it('checks the email and phone', () => {
		expect(issuePaths({ ...valid, email: 'not-an-email' })).toEqual(['email']);
		expect(issuePaths({ ...valid, phone: '12345' })).toEqual(['phone']);
		expect(
			contactSchema.parse({ ...valid, phone: '(555) 555-0100' }).phone,
		).toBe('(555) 555-0100');
	});

	it('normalizes and format-checks the confirmation id', () => {
		expect(
			contactSchema.parse({ ...valid, bookingConfirmationId: ' abc234 ' })
				.bookingConfirmationId,
		).toBe('ABC234');
		expect(issuePaths({ ...valid, bookingConfirmationId: 'ABC' })).toEqual([
			'bookingConfirmationId',
		]);
		// I and O are never used in confirmation ids.
		expect(issuePaths({ ...valid, bookingConfirmationId: 'ABCDIO' })).toEqual([
			'bookingConfirmationId',
		]);
	});
});

describe('contactReplyHref', () => {
	it('opens a reply to the guest with the subject', () => {
		expect(
			contactReplyHref({
				email: 'casey@example.test',
				subject: 'Late arrival',
			}),
		).toBe('mailto:casey@example.test?subject=Re%3A%20Late%20arrival');
		expect(
			contactReplyHref({ email: 'a@b.test', subject: 'Re: Question' }),
		).toBe('mailto:a@b.test?subject=Re%3A%20Question');
	});

	it('cannot add headers through the address', () => {
		const href = contactReplyHref({
			email: 'a@b.test?bcc=x@y.test',
			subject: 'Hi',
		});
		expect(href.split('?')).toHaveLength(2);
		expect(href).not.toContain('&');
	});
});

describe('inbox cursors and search params', () => {
	it('round-trips a cursor', () => {
		const cursor = encodeInboxCursor({
			surfacedAt: new Date('2030-01-01T00:00:00Z'),
			publicId: 'abcdefghij012345',
		});
		expect(cursor).toBe('1893456000.abcdefghij012345');
		expect(decodeInboxCursor(cursor)).toEqual({
			surfacedAt: 1893456000,
			publicId: 'abcdefghij012345',
		});
	});

	it('drops invalid search params instead of failing', () => {
		expect(
			inboxSearchSchema.parse({
				view: 'nope',
				source: 'stripe',
				cursor: 'bad',
				pageSize: 7,
			}),
		).toEqual({ source: 'stripe' });
	});
});

// --- rateLimitFnMiddleware wiring --------------------------------------------

const start = vi.hoisted(() => ({
	getRequestHeaders: vi.fn(
		() => new Headers({ 'cf-connecting-ip': '203.0.113.7' }),
	),
	setResponseStatus: vi.fn(),
	setResponseHeader: vi.fn(),
}));
vi.mock('@tanstack/react-start/server', () => start);
vi.mock('cloudflare:workers', () => ({ env: { API_RATE_LIMITER: {} } }));
const limiter = vi.hoisted(() => ({ isRateLimited: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/rate-limit')>()),
	isRateLimited: limiter.isRateLimited,
}));

const { rateLimitFnMiddleware, RATE_LIMITED_MESSAGE } =
	await import('@/core/middleware/rate-limit');

type Server = (args: { next: () => unknown }) => Promise<unknown>;

async function run() {
	const middleware = rateLimitFnMiddleware(
		'API_RATE_LIMITER',
		'contact.submit',
	);
	expect((middleware.options as { type?: string }).type).toBe('function');
	const next = vi.fn(() => 'handler ran');
	const result = (middleware.options.server as Server)({ next });
	return { result, next };
}

describe('rateLimitFnMiddleware', () => {
	afterEach(() => vi.clearAllMocks());

	it('counts the call by IP under its scope and continues', async () => {
		limiter.isRateLimited.mockResolvedValueOnce(false);
		const { result, next } = await run();
		expect(await result).toBe('handler ran');
		expect(next).toHaveBeenCalledOnce();
		expect(limiter.isRateLimited).toHaveBeenCalledWith(
			expect.anything(),
			'API_RATE_LIMITER',
			'contact.submit:ip:203.0.113.7',
			{ path: 'contact.submit', ip: '203.0.113.7' },
		);
	});

	it('over the limit: 429 with Retry-After, and the handler does not run', async () => {
		limiter.isRateLimited.mockResolvedValueOnce(true);
		const { result, next } = await run();
		await expect(result).rejects.toThrow(RATE_LIMITED_MESSAGE);
		expect(next).not.toHaveBeenCalled();
		expect(start.setResponseStatus).toHaveBeenCalledWith(429);
		expect(start.setResponseHeader).toHaveBeenCalledWith('Retry-After', '60');
	});
});
