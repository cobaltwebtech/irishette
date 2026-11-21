import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { TRPCRouter } from './router';

/** Procedure input types, e.g. `RouterInputs['bookings']['adminModifyBooking']`. */
export type RouterInputs = inferRouterInputs<TRPCRouter>;

/** Procedure output types, e.g. `RouterOutputs['bookings']['getMyBookings']`. */
export type RouterOutputs = inferRouterOutputs<TRPCRouter>;
