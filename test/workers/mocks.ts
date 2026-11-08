import { HttpResponse, http } from 'msw';

import { network } from './network';

// msw handlers for the third-party APIs the Worker calls. Each helper
// installs handlers for the current test (reset after each test in setup.ts)
// and returns a recorder of the requests it saw.

interface SentEmail {
	to: string[];
	subject: string;
	replyTo: string[];
	from: string;
}

type ResendBody = {
	to: string | string[];
	subject: string;
	from: string;
	reply_to?: string | string[];
};

const asList = (value: string | string[] | undefined) =>
	value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Resend: accepts single and batch sends and records recipients and
 * subjects. Honors Idempotency-Key like Resend (a repeated key sends nothing).
 */
export function mockResend() {
	const sent: SentEmail[] = [];
	const seenKeys = new Set<string>();
	const record = (email: ResendBody) =>
		sent.push({
			to: asList(email.to),
			subject: email.subject,
			replyTo: asList(email.reply_to),
			from: email.from,
		});
	const duplicate = (request: { headers: Headers }) => {
		const key = request.headers.get('idempotency-key');
		if (!key) return false;
		if (seenKeys.has(key)) return true;
		seenKeys.add(key);
		return false;
	};
	network.use(
		http.post('https://api.resend.com/emails', async ({ request }) => {
			const body = (await request.json()) as ResendBody;
			if (!duplicate(request)) record(body);
			return HttpResponse.json({ id: `email_${sent.length}` });
		}),
		http.post('https://api.resend.com/emails/batch', async ({ request }) => {
			const body = (await request.json()) as ResendBody[];
			if (!duplicate(request)) body.forEach(record);
			return HttpResponse.json({
				data: body.map((_, i) => ({ id: `email_${sent.length}_${i}` })),
			});
		}),
	);
	return sent;
}

export interface FakePaymentIntent {
	id: string;
	amount: number;
	currency?: string;
	status?: string;
	metadata?: Record<string, string>;
	customer?: string | null;
}

/** Stripe: GET /v1/payment_intents/:id returns the given intents. */
export function mockStripePaymentIntents(...intents: FakePaymentIntent[]) {
	const byId = new Map(intents.map((pi) => [pi.id, pi]));
	network.use(
		http.get('https://api.stripe.com/v1/payment_intents/:id', ({ params }) => {
			const pi = byId.get(String(params.id));
			if (!pi) {
				return HttpResponse.json(
					{
						error: { type: 'invalid_request_error', code: 'resource_missing' },
					},
					{ status: 404 },
				);
			}
			return HttpResponse.json(paymentIntentObject(pi));
		}),
	);
}

export function paymentIntentObject(pi: FakePaymentIntent) {
	return {
		id: pi.id,
		object: 'payment_intent',
		amount: pi.amount,
		amount_received: pi.status === 'succeeded' ? pi.amount : 0,
		currency: pi.currency ?? 'usd',
		status: pi.status ?? 'succeeded',
		metadata: pi.metadata ?? {},
		customer: pi.customer ?? null,
		latest_charge: `ch_${pi.id}`,
		livemode: false,
	};
}

/** Stripe: POST /v1/payment_intents/:id/cancel succeeds; records the ids. */
export function mockStripeIntentCancel() {
	const cancelled: string[] = [];
	network.use(
		http.post(
			'https://api.stripe.com/v1/payment_intents/:id/cancel',
			({ params }) => {
				cancelled.push(String(params.id));
				return HttpResponse.json(
					paymentIntentObject({
						id: String(params.id),
						amount: 0,
						status: 'canceled',
					}),
				);
			},
		),
	);
	return cancelled;
}

/** Stripe: POST /v1/refunds succeeds and records the form body. */
export function mockStripeRefunds() {
	const refunds: Array<{
		body: URLSearchParams;
		idempotencyKey: string | null;
	}> = [];
	network.use(
		http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
			const body = new URLSearchParams(await request.text());
			refunds.push({
				body,
				idempotencyKey: request.headers.get('idempotency-key'),
			});
			return HttpResponse.json({
				id: `re_${refunds.length}`,
				object: 'refund',
				status: 'succeeded',
				payment_intent: body.get('payment_intent'),
				amount: Number(body.get('amount') ?? 0),
			});
		}),
	);
	return refunds;
}

/** An iCal feed URL that serves the given body (and optional headers). */
export function mockFeed(
	url: string,
	respond: (request: { headers: Headers }) => Response | Promise<Response>,
) {
	const requests: Array<{ headers: Headers }> = [];
	network.use(
		http.get(url, ({ request }) => {
			requests.push({ headers: new Headers(request.headers) });
			return respond(request);
		}),
	);
	return requests;
}

export function calendarResponse(body: string, headers: HeadersInit = {}) {
	// Headers (not object spread) so array-form HeadersInit also works.
	const merged = new Headers({
		'Content-Type': 'text/calendar; charset=utf-8',
	});
	for (const [name, value] of new Headers(headers)) merged.set(name, value);
	return new HttpResponse(body, { status: 200, headers: merged });
}

/** Builds a VCALENDAR from VEVENT property blocks (CRLF line endings). */
export function vcalendar(events: string[][]): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Test//Feed//EN',
		...events.flatMap((props) => ['BEGIN:VEVENT', ...props, 'END:VEVENT']),
		'END:VCALENDAR',
	];
	return `${lines.join('\r\n')}\r\n`;
}

const SITEVERIFY_URL =
	'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Turnstile Siteverify: answers with `result` (or an HTTP error / a hang) and
 * records the form fields it received.
 */
export function mockTurnstile(
	result:
		| { success: boolean; 'error-codes'?: string[] }
		| { status: number }
		| 'hang',
) {
	const requests: URLSearchParams[] = [];
	network.use(
		http.post(SITEVERIFY_URL, async ({ request }) => {
			const form = await request.formData();
			requests.push(
				new URLSearchParams(
					[...form.entries()].map(
						([k, v]) =>
							[k, typeof v === 'string' ? v : v.name] as [string, string],
					),
				),
			);
			if (result === 'hang') return new Promise<never>(() => {});
			if ('status' in result) {
				return new HttpResponse('error', { status: result.status });
			}
			return HttpResponse.json(result);
		}),
	);
	return requests;
}
