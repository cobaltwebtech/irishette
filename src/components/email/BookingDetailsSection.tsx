import { Column, Heading, Row, Section, Text } from 'react-email';

// The booking details every booking email shows (confirmation, cancellation,
// refund): the stay, the guest and the price breakdown. Values arrive
// formatted from src/lib/email/email-service.ts (dates, times, site constants).

export interface EmailBookingDetails {
	confirmationId: string;
	roomName: string;
	/** e.g. "Wednesday, June 10, 2030" */
	checkInDate: string;
	/** e.g. "4:00 PM CT" */
	checkInTime: string;
	checkOutDate: string;
	checkOutTime: string;
	numberOfNights: number;
	numberOfGuests: number;
	guestName: string;
	guestEmail: string;
	guestPhone?: string | null;
	specialRequests?: string | null;
	baseAmount: number;
	feesAmount: number;
	taxAmount: number;
	totalAmount: number;
}

export const formatEmailCurrency = (amount: number, currency = 'usd') =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: currency.toUpperCase(),
	}).format(amount);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Field({ label, value }: { label: string; value: string }) {
	return (
		<>
			<Text className="mb-1 text-sm font-semibold text-stone-700">{label}</Text>
			<Text className="mt-0 mb-3 text-base text-stone-900">{value}</Text>
		</>
	);
}

function SectionHeading({ children }: { children: string }) {
	return (
		<Heading
			as="h3"
			className="mb-4 border-b border-stone-200 pb-2 text-xl font-bold text-stone-900"
		>
			{children}
		</Heading>
	);
}

function PriceRow({
	label,
	amount,
	strong = false,
}: {
	label: string;
	amount: number;
	strong?: boolean;
}) {
	const text = strong
		? 'text-lg font-bold text-stone-900'
		: 'text-base text-stone-700';
	return (
		<Row className="mb-2">
			<Column className="w-2/3">
				<Text className={`my-0 ${text}`}>{label}</Text>
			</Column>
			<Column className="w-1/3 text-right">
				<Text className={`my-0 ${text}`}>{formatEmailCurrency(amount)}</Text>
			</Column>
		</Row>
	);
}

/** Stay, guest and payment summary. */
export function BookingDetailsSection({
	booking: b,
	totalLabel = 'Total Paid',
}: {
	booking: EmailBookingDetails;
	totalLabel?: string;
}) {
	return (
		<>
			<Section className="mb-[32px]">
				<SectionHeading>Booking Details</SectionHeading>
				<Row>
					<Column className="w-1/2 pr-4 align-top">
						<Field label="Confirmation ID" value={b.confirmationId} />
						<Field label="Room" value={b.roomName} />
						<Field label="Guests" value={plural(b.numberOfGuests, 'guest')} />
						<Field
							label="Length of Stay"
							value={plural(b.numberOfNights, 'night')}
						/>
					</Column>
					<Column className="w-1/2 pl-4 align-top">
						<Field
							label="Check-in"
							value={`${b.checkInDate}, from ${b.checkInTime}`}
						/>
						<Field
							label="Check-out"
							value={`${b.checkOutDate}, by ${b.checkOutTime}`}
						/>
					</Column>
				</Row>
			</Section>

			<Section className="mb-[32px]">
				<SectionHeading>Guest Information</SectionHeading>
				<Row>
					<Column className="w-1/2 pr-4 align-top">
						<Field label="Name" value={b.guestName} />
						{b.guestPhone ? <Field label="Phone" value={b.guestPhone} /> : null}
					</Column>
					<Column className="w-1/2 pl-4 align-top">
						<Field label="Email" value={b.guestEmail} />
					</Column>
				</Row>
				{b.specialRequests ? (
					<Field label="Special Requests" value={b.specialRequests} />
				) : null}
			</Section>

			<Section className="mb-[32px] rounded-lg border border-stone-200 bg-stone-50 p-6">
				<Heading as="h3" className="mb-4 text-xl font-bold text-stone-900">
					Payment Summary
				</Heading>
				<PriceRow
					label={`Room Rate (${plural(b.numberOfNights, 'night')})`}
					amount={b.baseAmount}
				/>
				{b.feesAmount > 0 && (
					<PriceRow label="Service Fee" amount={b.feesAmount} />
				)}
				{b.taxAmount > 0 && <PriceRow label="Taxes" amount={b.taxAmount} />}
				<Section className="border-t border-stone-300 pt-3">
					<PriceRow label={totalLabel} amount={b.totalAmount} strong />
				</Section>
			</Section>
		</>
	);
}
