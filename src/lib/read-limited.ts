// Reading a request or response body with a size cap. Pure.

/** Thrown when a body is larger than the allowed size. */
export class BodyTooLargeError extends Error {
	override name = 'BodyTooLargeError';
}

/**
 * The body as text, refusing more than `maxBytes` (checks Content-Length
 * first, then counts while streaming, so a large body is never buffered).
 */
export async function readTextLimited(
	message: Request | Response,
	maxBytes: number,
): Promise<string> {
	const declared = Number(message.headers.get('content-length'));
	if (declared > maxBytes) {
		await message.body?.cancel();
		throw new BodyTooLargeError(`Body is larger than ${maxBytes} bytes`);
	}
	if (!message.body) return '';
	const reader = message.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new BodyTooLargeError(`Body is larger than ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}
