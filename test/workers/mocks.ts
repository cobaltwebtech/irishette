import { HttpResponse, http } from 'msw';
import { network } from './network';

// msw handlers for the third-party APIs the Worker calls. Each helper
// installs handlers for the current test (reset after each test in setup.ts)
// and returns a recorder of the requests it saw.

interface SentEmail {
	to: string[];
	subject: string;
}

/** Resend: accepts every email and records recipients and subjects. */
export function mockResend() {
	const sent: SentEmail[] = [];
	network.use(
		http.post('https://api.resend.com/emails', async ({ request }) => {
			const body = (await request.json()) as {
				to: string | string[];
				subject: string;
			};
			sent.push({
				to: Array.isArray(body.to) ? body.to : [body.to],
				subject: body.subject,
			});
			return HttpResponse.json({ id: `email_${sent.length}` });
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
	return new HttpResponse(body, {
		status: 200,
		headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...headers },
	});
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
