import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';

import { bookings } from '@/db/schema-export';
import { sendBookingConfirmedEmails } from '@/lib/email/email-service';

import {
	bookingInput,
	caller,
	db,
	insertBooking,
	trpcError,
	useClock,
} from './helpers';

// The estimated arrival window (src/lib/booking/arrival-windows.ts): required
// when booking, stored on the booking, shown to the guest, the admins and in
// both confirmation emails. It is informational only.

const guest = () => caller('user');

function captureEmails() {
	const sent: { to: string[]; html: string; text: string }[] = [];
	env.EMAIL = {
		send: async (m: { to: string[]; html?: string; text?: string }) => {
			sent.push({ to: m.to, html: m.html ?? '', text: m.text ?? '' });
			return { messageId: 'm' };
		},
	} as unknown as SendEmail;
	return sent;
}

describe('estimated arrival', () => {
	useClock('2035-03-20T17:00:00Z');

	it('is stored with the booking and shown to the guest', async () => {
		const { bookingId, publicId } = await guest().bookings.createBooking(
			bookingInput({
				checkInDate: '2035-04-10',
				checkOutDate: '2035-04-12',
				estimatedArrival: '19:00',
			}),
		);
		const [row] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, bookingId));
		expect(row.estimatedArrival).toBe('19:00');
		const { booking } = await guest().bookings.getBooking({ publicId });
		expect(booking.estimatedArrival).toBe('19:00');
	});

	it('is required, and only the offered windows are accepted', async () => {
		const { estimatedArrival: _omitted, ...withoutArrival } = bookingInput({
			checkInDate: '2035-05-10',
			checkOutDate: '2035-05-12',
		});
		await expect(
			caller('other').bookings.createBooking(withoutArrival as never),
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			caller('other').bookings.createBooking(
				bookingInput({
					checkInDate: '2035-05-10',
					checkOutDate: '2035-05-12',
					estimatedArrival: '17:30' as never,
				}),
			),
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		expect(
			(
				await trpcError(
					caller('other').bookings.createBooking(withoutArrival as never),
				)
			).message,
		).toMatch(/estimated arrival/i);
	});

	it('is in the guest confirmation and the admin notification', async () => {
		const sent = captureEmails();
		const { id } = await insertBooking({ estimatedArrival: '17:00' });
		const [booking] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, id));
		await sendBookingConfirmedEmails(db(), env, booking, { name: 'Rose Room' });
		const guestEmail = sent.find((e) => e.to.includes(booking.guestEmail));
		const adminEmail = sent.find((e) => !e.to.includes(booking.guestEmail));
		expect(guestEmail?.text).toContain('5:00 PM - 6:00 PM');
		expect(guestEmail?.text).toContain('meet you in person');
		expect(guestEmail?.text).toContain('Free on-site parking');
		expect(guestEmail?.text).toContain('No pets');
		expect(guestEmail?.text).toContain('No smoking');
		expect(guestEmail?.html).toContain('/cancellation-refund-policy');
		expect(adminEmail?.text).toContain('5:00 PM - 6:00 PM');
	});

	it('is left out of the emails for older bookings without one', async () => {
		const sent = captureEmails();
		const { id } = await insertBooking({ estimatedArrival: null });
		const [booking] = await db()
			.select()
			.from(bookings)
			.where(eq(bookings.id, id));
		await sendBookingConfirmedEmails(db(), env, booking, { name: 'Rose Room' });
		expect(sent.length).toBeGreaterThan(0);
		for (const email of sent) {
			expect(email.text).not.toMatch(/estimated arrival/i);
		}
	});
});
