// schema.org LodgingReservation markup (JSON-LD). Gmail, Outlook and Apple
// Mail read it to show a reservation card for the email. Nothing is visible
// in the message itself. Gmail only shows the card to registered senders (and
// for mail you send to yourself); see docs/EMAIL_RESERVATION_MARKUP.md.
//
// Email templates import nothing outside this folder (Fallow `email` zone), so
// the data arrives as props from src/lib/email/email-service.ts.

export interface ReservationMarkupData {
	/** The booking's confirmation ID. */
	reservationNumber: string;
	guestName: string;
	guestEmail: string;
	propertyName: string;
	propertyUrl: string;
	/** E.164, e.g. "+15555550123". */
	telephone: string;
	address: {
		streetAddress: string;
		addressLocality: string;
		addressRegion: string;
		postalCode: string;
		addressCountry: string;
	};
	/** ISO 8601 with offset, e.g. "2030-06-10T16:00:00-05:00". */
	checkinDate: string;
	checkoutDate: string;
	roomName: string;
	/** Total as a decimal string, e.g. "412.50". */
	price: string;
	/** ISO 4217, e.g. "USD". */
	priceCurrency: string;
	/** Page where the guest can view and manage the booking. */
	bookingUrl: string;
	/** ISO 8601 time the booking was last changed. */
	modifiedTime: string;
}

/** The LodgingReservation object for a confirmed booking. */
export function lodgingReservation(d: ReservationMarkupData) {
	return {
		'@context': 'http://schema.org',
		'@type': 'LodgingReservation',
		reservationNumber: d.reservationNumber,
		reservationStatus: 'http://schema.org/Confirmed',
		underName: { '@type': 'Person', name: d.guestName, email: d.guestEmail },
		reservationFor: {
			'@type': 'LodgingBusiness',
			name: d.propertyName,
			url: d.propertyUrl,
			telephone: d.telephone,
			address: { '@type': 'PostalAddress', ...d.address },
		},
		checkinDate: d.checkinDate,
		checkoutDate: d.checkoutDate,
		lodgingUnitDescription: d.roomName,
		price: d.price,
		priceCurrency: d.priceCurrency,
		url: d.bookingUrl,
		modifyReservationUrl: d.bookingUrl,
		modifiedTime: d.modifiedTime,
	};
}

/**
 * JSON for a <script> element. Guest-supplied text (the name) must not be able
 * to close the tag, so `<` is written as its JSON escape.
 */
export function reservationJson(d: ReservationMarkupData): string {
	// The backslash and "u003c" are joined at runtime on purpose: a single
	// escape sequence in source is easy to turn into a plain "<" by accident.
	const escapedLessThan = '\\' + 'u003c';
	return JSON.stringify(lodgingReservation(d)).replaceAll('<', escapedLessThan);
}

export function ReservationMarkup({ data }: { data: ReservationMarkupData }) {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: reservationJson(data) }}
		/>
	);
}
