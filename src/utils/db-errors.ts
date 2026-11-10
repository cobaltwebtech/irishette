// Recognizing D1/SQLite constraint errors. Pure.

/**
 * True when a write failed on a UNIQUE constraint. D1 wraps the SQLite error,
 * so the message may be on the error or on its cause.
 */
export function isUniqueViolation(error: unknown): boolean {
	return (
		error instanceof Error &&
		/UNIQUE constraint failed/i.test(
			`${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`,
		)
	);
}
