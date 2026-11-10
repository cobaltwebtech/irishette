import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

// Wiring of requireSessionMiddleware / requireAdminMiddleware. The checks
// behind authorizeRequest run against D1 in
// test/workers/server-fn-auth.test.ts; here Start's request helpers and
// authorizeRequest are mocked (no request, no Worker bindings in Node).
const start = vi.hoisted(() => ({
	getRequestHeaders: vi.fn(() => new Headers({ cookie: 'session=x' })),
	setResponseStatus: vi.fn(),
}));
vi.mock('@tanstack/react-start/server', () => start);

const serverAuth = vi.hoisted(() => {
	class ServerFnAuthError extends Error {
		constructor(readonly status: 401 | 403) {
			super(status === 401 ? 'Unauthorized' : 'Forbidden');
		}
	}
	return { ServerFnAuthError, authorizeRequest: vi.fn() };
});
vi.mock('@/lib/auth/server-auth', () => serverAuth);

const { requireAdminMiddleware, requireSessionMiddleware } =
	await import('@/core/middleware/auth');

type Server = (args: {
	next: (opts?: { context?: unknown }) => unknown;
}) => Promise<unknown>;

/** Runs a middleware's server step; returns the context passed to next(). */
async function run(middleware: { options: { server?: unknown } }) {
	const next = vi.fn((opts?: { context?: unknown }) => opts);
	await (middleware.options.server as Server)({ next });
	return next.mock.calls[0]?.[0]?.context;
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('server function auth middleware', () => {
	it('are function middleware', () => {
		for (const middleware of [
			requireSessionMiddleware,
			requireAdminMiddleware,
		]) {
			expect((middleware.options as { type?: string }).type).toBe('function');
		}
	});

	it('passes context.user on success, checking the request headers', async () => {
		const user = { id: 'u1' };
		serverAuth.authorizeRequest.mockResolvedValueOnce(user);
		expect(await run(requireSessionMiddleware)).toEqual({ user });
		expect(serverAuth.authorizeRequest).toHaveBeenCalledWith(
			expect.any(Headers),
			'user',
		);
		const headers = serverAuth.authorizeRequest.mock.calls[0][0] as Headers;
		expect(headers.get('cookie')).toBe('session=x');
	});

	it('sets 401 / 403 and does not call next() on failure', async () => {
		serverAuth.authorizeRequest.mockRejectedValueOnce(
			new serverAuth.ServerFnAuthError(401),
		);
		await expect(run(requireSessionMiddleware)).rejects.toThrow('Unauthorized');
		expect(start.setResponseStatus).toHaveBeenLastCalledWith(401);

		serverAuth.authorizeRequest.mockRejectedValueOnce(
			new serverAuth.ServerFnAuthError(403),
		);
		await expect(run(requireAdminMiddleware)).rejects.toThrow('Forbidden');
		expect(start.setResponseStatus).toHaveBeenLastCalledWith(403);
		expect(serverAuth.authorizeRequest).toHaveBeenLastCalledWith(
			expect.any(Headers),
			'admin',
		);
	});

	it('leaves the status alone for unexpected errors', async () => {
		serverAuth.authorizeRequest.mockRejectedValueOnce(new Error('D1 down'));
		await expect(run(requireAdminMiddleware)).rejects.toThrow('D1 down');
		expect(start.setResponseStatus).not.toHaveBeenCalled();
	});
});
