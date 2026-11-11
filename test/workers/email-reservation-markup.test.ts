import { eq } from 'drizzle-orm';
import React from 'react';
import { render } from 'react-email';
import { describe, expect, it } from 'vite-plus/test';

import { BookingConfirmationEmail } from '@/components/email/BookingConfirmationEmail';
import { bookings } from '@/db/schema-export';
import {
	emailBookingDetails,
	reservationMarkup,
} from '@/lib/email/email-service';
import {
	CONTACT_PHONE_E164,
	formatAddress,
	PROPERTY_ADDRESS,
} from '@/lib/site';

import { db, insertBooking } from './helpers';

// The guest confirmation carries schema.org LodgingReservation markup (the
// Gmail / Outlook reservation card) built from the property details in
// src/lib/site.ts.

const BASE_URL = 'https://site.test';
const room = { name: 'Rose Room' };

async function booking(overrides: Parameters<typeof insertBooking>[0] = {}) {
	const { id } = await insertBooking(overrides);
	const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
	return row;
}

type Row = Awaited<ReturnType<typeof booking>>;

function confirmationElement(b: Row) {
	return React.createElement(BookingConfirmationEmail, {
		booking: emailBookingDetails(b, room),
		accountUrl: `${BASE_URL}/account`,
		reservation: reservationMarkup(b, room, BASE_URL),
		propertyAddress: formatAddress(PROPERTY_ADDRESS),
		logoUrl: `${BASE_URL}/icons/irishette-logo.png`,
		siteUrl: BASE_URL,
		contactEmail: 'bookings@example.test',
	});
}

function jsonLd(html: string): Record<string, any>[] {
	return [
		...html.matchAll(
			/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
		),
	].map((m) => JSON.parse(m[1]));
}

describe('reservation markup', () => {
	it('is built from the booking, with Central Time offsets', async () => {
		const b = await booking();
		expect(reservationMarkup(b, room, BASE_URL)).toMatchObject({
			reservationNumber: b.confirmationId,
			checkinDate: '2030-06-10T16:00:00-05:00',
			checkoutDate: '2030-06-12T11:00:00-05:00',
			price: '250.00',
			priceCurrency: 'USD',
			bookingUrl: `${BASE_URL}/account/booking/${b.publicId}`,
			telephone: '+12544545558',
			address: PROPERTY_ADDRESS,
		});
	});

	it('is skipped when the booking is not confirmed', async () => {
		const cancelled = await booking({ status: 'cancelled' });
		expect(reservationMarkup(cancelled, room, BASE_URL)).toBeUndefined();
	});

	it('is in the confirmation HTML, not the plain text', async () => {
		const element = confirmationElement(
			await booking({ guestName: 'Eve </script><b>x</b>' }),
		);
		const html = await render(element);
		const text = await render(element, { plainText: true });

		const [markup] = jsonLd(html);
		expect(markup['@type']).toBe('LodgingReservation');
		expect(markup.reservationStatus).toBe('http://schema.org/Confirmed');
		expect(markup.reservationFor.telephone).toBe(CONTACT_PHONE_E164);
		expect(markup.reservationFor.address.streetAddress).toBe(
			'506 W Mesquite St',
		);
		expect(markup.reservationFor.address.postalCode).toBe('76446');
		// A guest name cannot close the script tag.
		expect(markup.underName.name).toBe('Eve </script><b>x</b>');
		expect(html).not.toContain('</script><b>');

		expect(text).not.toContain('LodgingReservation');
		expect(html).toContain('506 W Mesquite St, Dublin, TX 76446');
	});
});
