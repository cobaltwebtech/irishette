import { notFound } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';

/** True when a tRPC call failed with the given error code. */
function hasTRPCCode(error: unknown, code: string): boolean {
	return isTRPCClientError(error) && error.data?.code === code;
}

/**
 * For route loaders: turns a tRPC NOT_FOUND into the router's notFound(), so
 * the route's notFoundComponent renders instead of the error boundary.
 * Works for both SSR (localLink) and browser (HTTP) calls.
 */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise;
	} catch (error) {
		if (hasTRPCCode(error, 'NOT_FOUND')) throw notFound();
		throw error;
	}
}
