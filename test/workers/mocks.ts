import { env } from 'cloudflare:workers';
import { HttpResponse, http } from 'msw';

import { network } from './network';

// msw handlers for the third-party APIs the Worker calls. Each helper
// installs handlers for the current test (reset after each test in setup.ts)
// and returns a recorder of the requests it saw.

interface SentEmail {
	to: string[];
	subject: string;
	replyTo: string[];
	from: EmailMessageBuilder['from'];
	/** The plain-text body. */
	text: string;
}

type Address = string | EmailAddress;

const asList = (value: Address | Address[] | undefined) =>
	value === undefined
		? []
		: (Array.isArray(value) ? value : [value]).map((a) =>
				typeof a === 'string' ? a : a.email,
			);

/**
 * Cloudflare Email Service: replaces `env.EMAIL` with a stub that records
 * recipients, subjects and senders (reset after each test in setup.ts).
 * `failFirst` rejects that many sends first, like a provider error
 * (nothing is recorded for a rejected send).
 */
export function mockEmail({ failFirst = 0 }: { failFirst?: number } = {}) {
	const sent: SentEmail[] = [];
	let failures = failFirst;
	env.EMAIL = {
		send: async (message: EmailMessageBuilder) => {
			if (failures > 0) {
				failures--;
				throw Object.assign(new Error('Email service unavailable'), {
					code: 'E_INTERNAL_SERVER_ERROR',
				});
			}
			sent.push({
				to: asList(message.to),
				subject: message.subject,
				replyTo: asList(message.replyTo),
				from: message.from,
				text: typeof message.text === 'string' ? message.text : '',
			});
			return { messageId: `email_${sent.length}` };
		},
	} as SendEmail;
	return sent;
}

/** The default `env.EMAIL` in tests: a send nobody mocked fails loudly. */
export function resetEmail() {
	env.EMAIL = {
		send: () => Promise.reject(new Error('Unmocked email send')),
	} as unknown as SendEmail;
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

// --- Stripe Checkout Sessions ------------------------------------------------

export interface FakeSession {
	id: string;
	status: 'open' | 'complete' | 'expired';
	payment_status: 'paid' | 'unpaid' | 'no_payment_required';
	amount_total: number;
	currency: string;
	mode: string;
	client_reference_id: string | null;
	metadata: Record<string, string>;
	client_secret: string;
	expires_at: number;
	payment_intent: string | null;
	/** Status of the session's PaymentIntent (manual capture, plan 05). */
	intent_status:
		| 'requires_payment_method'
		| 'requires_capture'
		| 'succeeded'
		| 'canceled';
	customer: string | null;
	livemode: boolean;
}

/** How a fake capture fails: Stripe 500 (transient) or 400 (permanent). */
export type CaptureFailure = 'transient' | 'permanent' | null;

interface CreatedSession {
	body: URLSearchParams;
	idempotencyKey: string | null;
	session: FakeSession;
}

const stripeError = (
	message: string,
	status = 400,
	type = 'invalid_request_error',
	code?: string,
) => HttpResponse.json({ error: { type, message, code } }, { status });

/** `expand[0]=a&expand[1]=b` (stripe-node) or `expand[]=a` query values. */
function expandParams(url: string) {
	return [...new URL(url).searchParams]
		.filter(([key]) => key.startsWith('expand['))
		.map(([, value]) => value);
}

/** Bracketed form fields with a prefix, e.g. metadata[bookingId]. */
function formRecord(body: URLSearchParams, prefix: string) {
	const out: Record<string, string> = {};
	for (const [key, value] of body) {
		const match = key.match(new RegExp(`^${prefix}\\[([^\\]]+)\\]$`));
		if (match) out[match[1]] = value;
	}
	return out;
}

/** Sum of line_items[i][price_data][unit_amount] * quantity. */
function lineItemsTotal(body: URLSearchParams) {
	let total = 0;
	for (let i = 0; body.has(`line_items[${i}][quantity]`); i++) {
		total +=
			Number(body.get(`line_items[${i}][price_data][unit_amount]`)) *
			Number(body.get(`line_items[${i}][quantity]`));
	}
	return total;
}

/**
 * A stateful fake of Checkout Sessions (create / retrieve / expire), their
 * PaymentIntents (capture / cancel, manual capture) and customers.create.
 * `complete(id)` simulates the guest paying (the card is authorized);
 * `add(session)` seeds an existing session. Retrieve expands
 * `payment_intent` (with its status, latest charge and a card payment
 * method) when asked, like Stripe. `failCapture` makes captures fail.
 */
export function mockStripeCheckout() {
	const sessions = new Map<string, FakeSession>();
	const created: CreatedSession[] = [];
	const expired: string[] = [];
	const captures: Array<{ intent: string; idempotencyKey: string | null }> = [];
	const cancels: Array<{ intent: string; reason: string | null }> = [];
	const state: { failCapture: CaptureFailure } = { failCapture: null };
	let counter = 0;
	const seen = new Map<string, FakeSession>();
	const capturedKeys = new Map<string, string>();

	const byIntent = (intent: string) =>
		[...sessions.values()].find((s) => s.payment_intent === intent);
	const intentJson = (s: FakeSession) => ({
		id: s.payment_intent,
		object: 'payment_intent',
		status: s.intent_status,
		amount: s.amount_total,
		amount_capturable:
			s.intent_status === 'requires_capture' ? s.amount_total : 0,
		amount_received: s.intent_status === 'succeeded' ? s.amount_total : 0,
		capture_method: 'manual',
		latest_charge: `ch_${s.payment_intent}`,
		payment_method: 'pm_1',
		payment_method_types: ['card'],
		metadata: s.metadata,
	});

	const toJson = (s: FakeSession, expand: string[]) => ({
		object: 'checkout.session',
		...s,
		client_secret: s.status === 'open' ? s.client_secret : null,
		payment_intent:
			s.payment_intent && expand.includes('payment_intent')
				? {
						...intentJson(s),
						payment_method: expand.includes('payment_intent.payment_method')
							? { id: 'pm_1', object: 'payment_method', type: 'card' }
							: 'pm_1',
					}
				: s.payment_intent,
	});

	network.use(
		http.post('https://api.stripe.com/v1/customers', () =>
			HttpResponse.json({ id: 'cus_test_new', object: 'customer' }),
		),
		http.post(
			'https://api.stripe.com/v1/checkout/sessions',
			async ({ request }) => {
				const body = new URLSearchParams(await request.text());
				const idempotencyKey = request.headers.get('idempotency-key');
				const replay = idempotencyKey ? seen.get(idempotencyKey) : undefined;
				if (replay) return HttpResponse.json(toJson(replay, []));
				counter += 1;
				const id = `cs_test_fake${counter}${Date.now()}`;
				const session: FakeSession = {
					id,
					status: 'open',
					payment_status: 'unpaid',
					amount_total: lineItemsTotal(body),
					currency: 'usd',
					mode: body.get('mode') ?? 'payment',
					client_reference_id: body.get('client_reference_id'),
					metadata: formRecord(body, 'metadata'),
					client_secret: `${id}_secret_fake`,
					expires_at: Number(body.get('expires_at')),
					payment_intent: null,
					intent_status: 'requires_payment_method',
					customer: body.get('customer'),
					livemode: false,
				};
				sessions.set(id, session);
				created.push({ body, idempotencyKey, session });
				if (idempotencyKey) seen.set(idempotencyKey, session);
				return HttpResponse.json(toJson(session, []));
			},
		),
		http.get(
			'https://api.stripe.com/v1/checkout/sessions/:id',
			({ params, request }) => {
				const s = sessions.get(String(params.id));
				if (!s) return stripeError('No such checkout.session', 404);
				return HttpResponse.json(toJson(s, expandParams(request.url)));
			},
		),
		http.post(
			'https://api.stripe.com/v1/checkout/sessions/:id/expire',
			({ params }) => {
				const s = sessions.get(String(params.id));
				if (!s) return stripeError('No such checkout.session', 404);
				if (s.status !== 'open') {
					return stripeError(
						'Only Checkout Sessions with a status of open can be expired.',
					);
				}
				s.status = 'expired';
				expired.push(s.id);
				return HttpResponse.json(toJson(s, []));
			},
		),
		http.post(
			'https://api.stripe.com/v1/payment_intents/:id/capture',
			({ params, request }) => {
				const intent = String(params.id);
				const s = byIntent(intent);
				if (!s) return stripeError('No such payment_intent', 404);
				const idempotencyKey = request.headers.get('idempotency-key');
				if (idempotencyKey && capturedKeys.get(idempotencyKey) === intent) {
					return HttpResponse.json(intentJson(s));
				}
				if (state.failCapture === 'transient') {
					return stripeError('Stripe is unavailable', 500, 'api_error');
				}
				if (
					state.failCapture === 'permanent' ||
					s.intent_status !== 'requires_capture'
				) {
					return stripeError(
						`This PaymentIntent could not be captured because it has a status of ${s.intent_status}.`,
						400,
						'invalid_request_error',
						'payment_intent_unexpected_state',
					);
				}
				s.intent_status = 'succeeded';
				s.payment_status = 'paid';
				captures.push({ intent, idempotencyKey });
				if (idempotencyKey) capturedKeys.set(idempotencyKey, intent);
				return HttpResponse.json(intentJson(s));
			},
		),
		http.get('https://api.stripe.com/v1/payment_intents/:id', ({ params }) => {
			const s = byIntent(String(params.id));
			if (!s) return stripeError('No such payment_intent', 404);
			return HttpResponse.json(intentJson(s));
		}),
		http.post(
			'https://api.stripe.com/v1/payment_intents/:id/cancel',
			async ({ params, request }) => {
				const intent = String(params.id);
				const s = byIntent(intent);
				if (!s) return stripeError('No such payment_intent', 404);
				if (s.intent_status !== 'requires_capture') {
					return stripeError(
						`You cannot cancel this PaymentIntent because it has a status of ${s.intent_status}.`,
						400,
						'invalid_request_error',
						'payment_intent_unexpected_state',
					);
				}
				const body = new URLSearchParams(await request.text());
				s.intent_status = 'canceled';
				cancels.push({ intent, reason: body.get('cancellation_reason') });
				return HttpResponse.json(intentJson(s));
			},
		),
	);

	return {
		sessions,
		created,
		expired,
		captures,
		cancels,
		/** Make captures fail until reset with null. */
		failCapture(mode: CaptureFailure) {
			state.failCapture = mode;
		},
		add(session: Partial<FakeSession> & { id: string }) {
			const full: FakeSession = {
				status: 'open',
				payment_status: 'unpaid',
				amount_total: 0,
				currency: 'usd',
				mode: 'payment',
				client_reference_id: null,
				metadata: {},
				client_secret: `${session.id}_secret_fake`,
				expires_at: Math.floor(Date.now() / 1000) + 1800,
				payment_intent: null,
				intent_status: 'requires_payment_method',
				customer: null,
				livemode: false,
				...session,
			};
			sessions.set(full.id, full);
			return full;
		},
		/**
		 * The guest paid: the card is authorized ('requires_capture'). The
		 * session reports 'unpaid' on purpose: the app must decide from the
		 * PaymentIntent status, not from payment_status (plan 05).
		 */
		complete(
			id: string,
			intentStatus: FakeSession['intent_status'] = 'requires_capture',
		) {
			const s = sessions.get(id);
			if (!s) throw new Error(`No fake session ${id}`);
			s.status = 'complete';
			s.intent_status = intentStatus;
			s.payment_status = intentStatus === 'succeeded' ? 'paid' : 'unpaid';
			s.payment_intent = `pi_${id}`;
			return s;
		},
		/** The session as a webhook payload object (not expanded). */
		object(id: string) {
			const s = sessions.get(id);
			if (!s) throw new Error(`No fake session ${id}`);
			return toJson(s, []);
		},
	};
}

export interface FakeCharge {
	id: string;
	amount: number;
	amount_refunded?: number;
	payment_intent?: string | null;
	/** metadata of the (expanded) PaymentIntent. */
	intentMetadata?: Record<string, string>;
	brand?: string;
	last4?: string;
}

/** Stripe: GET /v1/charges/:id (expands payment_intent when asked). */
export function mockStripeCharges(...charges: FakeCharge[]) {
	const byId = new Map(charges.map((c) => [c.id, c]));
	const state = { unavailable: false };
	network.use(
		http.get('https://api.stripe.com/v1/charges/:id', ({ params, request }) => {
			if (state.unavailable) {
				return stripeError('Stripe is unavailable', 500, 'api_error');
			}
			const c = byId.get(String(params.id));
			if (!c) return stripeError('No such charge', 404);
			const expand = expandParams(request.url);
			return HttpResponse.json({
				id: c.id,
				object: 'charge',
				amount: c.amount,
				amount_refunded: c.amount_refunded ?? 0,
				currency: 'usd',
				payment_intent:
					c.payment_intent && expand.includes('payment_intent')
						? {
								id: c.payment_intent,
								object: 'payment_intent',
								metadata: c.intentMetadata ?? {},
							}
						: (c.payment_intent ?? null),
				payment_method_details: {
					type: 'card',
					card: { brand: c.brand ?? 'visa', last4: c.last4 ?? '4242' },
				},
				receipt_url: null,
			});
		}),
	);
	return {
		set(id: string, patch: Partial<FakeCharge>) {
			const c = byId.get(id);
			if (c) Object.assign(c, patch);
		},
		/** Answer 500 (a transient Stripe outage) until set back to false. */
		setUnavailable(value: boolean) {
			state.unavailable = value;
		},
	};
}

/**
 * Stripe refunds with state: POST /v1/refunds (fails with a 500 while
 * `unavailable` is set) and GET /v1/refunds?payment_intent= (lists created
 * and `existing` refunds), for the payment recovery retries.
 */
export function mockStripeRefundsStateful() {
	const created: Array<{
		body: URLSearchParams;
		idempotencyKey: string | null;
	}> = [];
	const listed: Array<Record<string, unknown>> = [];
	const state = { unavailable: false };
	network.use(
		http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
			if (state.unavailable) {
				return stripeError('Stripe is unavailable', 500, 'api_error');
			}
			const body = new URLSearchParams(await request.text());
			created.push({
				body,
				idempotencyKey: request.headers.get('idempotency-key'),
			});
			const refund = {
				id: `re_stateful_${created.length}`,
				object: 'refund',
				status: 'succeeded',
				payment_intent: body.get('payment_intent'),
				amount: Number(body.get('amount') ?? 0),
				currency: 'usd',
				created: Math.floor(Date.now() / 1000),
				metadata: formRecord(body, 'metadata'),
			};
			listed.push(refund);
			return HttpResponse.json(refund);
		}),
		http.get('https://api.stripe.com/v1/refunds', ({ request }) => {
			const intent = new URL(request.url).searchParams.get('payment_intent');
			return HttpResponse.json({
				object: 'list',
				has_more: false,
				data: listed.filter((r) => r.payment_intent === intent),
			});
		}),
	);
	return {
		created,
		/** Refunds Stripe already has (e.g. created before a crash). */
		existing: listed,
		setUnavailable(value: boolean) {
			state.unavailable = value;
		},
	};
}

/** Stripe: POST /v1/refunds fails (e.g. the charge can't be refunded). */
export function mockStripeRefundsFailing() {
	const attempts: URLSearchParams[] = [];
	network.use(
		http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
			attempts.push(new URLSearchParams(await request.text()));
			return HttpResponse.json(
				{
					error: {
						type: 'invalid_request_error',
						code: 'charge_already_refunded',
						message: 'Charge has already been refunded.',
					},
				},
				{ status: 400 },
			);
		}),
	);
	return attempts;
}
