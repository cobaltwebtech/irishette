import type { inferRouterOutputs } from '@trpc/server';
import type { TRPCRouter } from './router';

/** Procedure output types, e.g. `RouterOutputs['bookings']['getMyBookings']`. */
export type RouterOutputs = inferRouterOutputs<TRPCRouter>;
