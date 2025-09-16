import { availabilityRouter } from './availability';
import { bookingsRouter } from './bookings';
import { createTRPCRouter } from './init';
import { roomsRouter } from './rooms';

export const trpcRouter = createTRPCRouter({
	rooms: roomsRouter,
	bookings: bookingsRouter,
	availability: availabilityRouter,
});

export type TRPCRouter = typeof trpcRouter;
