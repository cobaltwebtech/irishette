# Email reservation markup (Gmail / Outlook / Apple Mail cards)

The guest booking confirmation carries a schema.org `LodgingReservation` as
JSON-LD. Mail apps that support it show a reservation card (stay dates, hotel,
link to manage the booking) above or beside the message, like the hotel cards
Gmail shows for big hotel chains. The markup is invisible in the message.

Code:

- `src/components/email/ReservationMarkup.tsx`: the JSON-LD builder and the
  `<script type="application/ld+json">` component (escapes `<` so a guest name
  cannot close the tag).
- `reservationMarkup()` in `src/lib/email/email-service.ts`: builds the data from
  a booking and the property details in `src/lib/site.ts` (`PROPERTY_ADDRESS`,
  `CONTACT_PHONE_E164`). Returns `undefined` (no markup) when the booking is not
  `confirmed`, so a re-sent confirmation for a cancelled booking never says
  "Confirmed".
- `formatInstantIso()` in `src/utils/timezone.ts`: check-in/out as ISO 8601 with
  the Central Time offset (`2030-06-10T16:00:00-05:00`).
- Tests: `test/workers/email-reservation-markup.test.ts`,
  `test/unit/instant-iso.test.ts`.

## Go-live checklist

1. Done: the real address and phone are set in `src/lib/site.ts`
   (`PROPERTY_ADDRESS`, `CONTACT_PHONE_E164`; pages show `254-454-5558`, links
   and markup use `+12544545558`). Google requires the full address and a phone
   number, so keep them complete if they change.
2. Switch the email senders in `src/lib/site.ts` to the production domain
   (the markup only matters once mail comes from `irishette.com`).
3. Test: send a confirmation to a Gmail account you control (mail sent to
   yourself shows the card without registration; DKIM or SPF must still pass).
   Paste the HTML into Google's Email Markup Tester to see extracted fields.
4. Register with Google for other guests' inboxes (below).
5. Send Microsoft's onboarding samples for Outlook (below).

## Who sees the card

- **Gmail**: only for senders registered with Google. Requirements (from
  [registering with Google](https://developers.google.com/workspace/gmail/markup/registering-with-google)):
  DKIM or SPF aligned with the From domain, a static From address, good
  deliverability and a low spam-complaint rate, and consistent volume (Google
  says "hundreds of emails a day" for a few weeks). Send a sample from
  production to `schema.whitelisting+sample@gmail.com` (do not forward it) and
  fill in the registration form. A low-volume B&B may not be approved.
- **Outlook**: Microsoft's developer blog lists `LodgingReservation` among the
  supported types and describes an onboarding step (sample emails to a
  Microsoft address). Re-check the current process before relying on it.
  Source: [Unlock your email potential with Schema.org](https://devblogs.microsoft.com/microsoft365dev/unlock-your-email-potential-with-schema-org/).
- **Apple Mail**: Apple documents schema.org reservation markup for Siri event
  suggestions ([WWDC20](https://developer.apple.com/videos/play/wwdc2020/10197)).
  Not verified for current Mail versions.

## Not done yet

- Cancellation and refund emails (`BookingNoticeEmail`) carry no markup.
  Apple's examples use `http://schema.org/ReservationCancelled`; Google's pages
  do not document a cancelled status. Verify in the Markup Tester before adding.
- `numAdults`, `image` and `cancelReservationUrl` are omitted (we do not store
  adults separately; no property image yet).
