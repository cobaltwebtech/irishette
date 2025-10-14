import { availabilityRouter } from './availability';
import { bookingsRouter } from './bookings';
import { createTRPCRouter } from './init';
import { roomsRouter } from './rooms';
import { usersRouter } from './users';

export const trpcRouter = createTRPCRouter({
	rooms: roomsRouter,
	bookings: bookingsRouter,
	availability: availabilityRouter,
	users: usersRouter,
});

export type TRPCRouter = typeof trpcRouter;
