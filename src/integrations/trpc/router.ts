import { availabilityRouter } from './availability';
import { bookingsRouter } from './bookings';
import { icalRouter } from './ical';
import { inboxRouter } from './inbox';
import { createTRPCRouter } from './init';
import { policiesRouter } from './policies';
import { reportsRouter } from './reports';
import { roomsRouter } from './rooms';
import { usersRouter } from './users';

export const trpcRouter = createTRPCRouter({
	rooms: roomsRouter,
	bookings: bookingsRouter,
	availability: availabilityRouter,
	ical: icalRouter,
	policies: policiesRouter,
	users: usersRouter,
	inbox: inboxRouter,
	reports: reportsRouter,
});

export type TRPCRouter = typeof trpcRouter;
