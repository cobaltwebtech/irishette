import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

import { securityHeadersMiddleware } from '@/core/middleware/security-headers';

// Server functions are same-origin RPC endpoints: reject cross-site calls.
// (Start only adds this by default when no requestMiddleware is configured.)
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => {
	return {
		defaultSsr: true,
		requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
	};
});
