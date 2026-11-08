// Parsing browser CSP violation reports into small, privacy-safe summaries
// for Workers Logs (src/routes/api/csp-report.ts). Pure.
//
// Two formats exist:
// - `report-uri`: Content-Type application/csp-report,
//   body { "csp-report": { "document-uri", "effective-directive", ... } }
// - `report-to` (Reporting API): Content-Type application/reports+json,
//   body [{ "type": "csp-violation", "body": { "documentURL", ... } }]
//
// Only the directive, the blocked origin (or keyword such as "inline"), the
// document path (no query string or fragment) and the disposition are kept.
// Never the full URLs, script samples or anything user-specific.

import { BodyTooLargeError, readTextLimited } from './read-limited';

/** Reports kept from one request (a page can batch many). */
export const MAX_REPORTS_PER_REQUEST = 10;
/** Largest request body read. */
export const MAX_REPORT_BODY_BYTES = 64 * 1024;

export interface CspViolation {
	directive: string;
	blocked: string;
	documentPath: string;
	disposition: string;
}

type Raw = Record<string, unknown>;

const text = (value: unknown, max = 100): string =>
	typeof value === 'string' ? value.slice(0, max) : '';

/** "https://js.stripe.com" for URLs; keywords ("inline", "eval") as is. */
function blockedSource(value: unknown): string {
	const raw = text(value, 2000);
	if (!raw) return 'unknown';
	try {
		const url = new URL(raw);
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url.origin
			: url.protocol.replace(':', '');
	} catch {
		return raw.slice(0, 40);
	}
}

function documentPath(value: unknown): string {
	try {
		return new URL(text(value, 2000)).pathname.slice(0, 200);
	} catch {
		return 'unknown';
	}
}

function summarize(fields: {
	directive: unknown;
	blocked: unknown;
	document: unknown;
	disposition: unknown;
}): CspViolation {
	return {
		directive: text(fields.directive, 60) || 'unknown',
		blocked: blockedSource(fields.blocked),
		documentPath: documentPath(fields.document),
		disposition: text(fields.disposition, 20) || 'unknown',
	};
}

/** Summaries of the violations in a report body (empty when unrecognized). */
export function parseCspReports(body: unknown): CspViolation[] {
	if (Array.isArray(body)) {
		return body
			.filter(
				(r): r is Raw =>
					!!r && typeof r === 'object' && (r as Raw).type === 'csp-violation',
			)
			.slice(0, MAX_REPORTS_PER_REQUEST)
			.map((r) => {
				const b = (r.body ?? {}) as Raw;
				return summarize({
					directive: b.effectiveDirective,
					blocked: b.blockedURL,
					document: b.documentURL ?? r.url,
					disposition: b.disposition,
				});
			});
	}
	if (body && typeof body === 'object' && 'csp-report' in body) {
		const r = ((body as Raw)['csp-report'] ?? {}) as Raw;
		return [
			summarize({
				directive: r['effective-directive'] ?? r['violated-directive'],
				blocked: r['blocked-uri'],
				document: r['document-uri'],
				disposition: r.disposition,
			}),
		];
	}
	return [];
}

const REPORT_TYPES = ['application/csp-report', 'application/reports+json'];

/**
 * POST /api/csp-report: logs one structured line per violation to Workers
 * Logs ({ "message": "csp-violation", directive, blocked, documentPath,
 * disposition }) and answers 204. Malformed or oversized bodies get 400/413;
 * nothing is stored.
 */
export async function handleCspReport(request: Request): Promise<Response> {
	const type = request.headers.get('content-type')?.split(';')[0].trim() ?? '';
	if (!REPORT_TYPES.includes(type) && type !== 'application/json') {
		return new Response(null, { status: 415 });
	}
	let body: unknown;
	try {
		body = JSON.parse(await readTextLimited(request, MAX_REPORT_BODY_BYTES));
	} catch (error) {
		return new Response(null, {
			status: error instanceof BodyTooLargeError ? 413 : 400,
		});
	}
	for (const violation of parseCspReports(body)) {
		console.warn(JSON.stringify({ message: 'csp-violation', ...violation }));
	}
	return new Response(null, { status: 204 });
}
