import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';

import { rateLimitFnMiddleware } from '@/core/middleware/rate-limit';
import { createDrizzle } from '@/db/drizzle-init';
import { submitContactForm } from '@/lib/inbox/contact-service';
import { contactSchema } from '@/lib/inbox/contact-validation';
import { clientIp } from '@/lib/security/rate-limit';

/**
 * The public contact form (docs/CONTACT_FORM.md). Public on purpose: it reads
 * no private data, so it has no session middleware. Protected by the
 * API_RATE_LIMITER binding (scope contact.submit) and Turnstile Siteverify in
 * the handler. Returns { ok } or a reason the form maps to a message.
 */
export const submitContactFn = createServerFn({ method: 'POST' })
	.middleware([rateLimitFnMiddleware('API_RATE_LIMITER', 'contact.submit')])
	.validator(contactSchema)
	.handler(({ data }) =>
		submitContactForm(
			{ db: createDrizzle(env.DB), env },
			data,
			clientIp(getRequestHeaders()),
		),
	);
