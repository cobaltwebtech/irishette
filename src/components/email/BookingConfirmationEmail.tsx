import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Heading,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Tailwind,
	Text,
} from '@react-email/components';
import type * as React from 'react';

interface BookingConfirmationEmailProps {
	confirmationId: string;
	guestName: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	guestEmail: string;
	guestPhone?: string;
	specialRequests?: string;
	baseAmount: number;
	taxAmount: number;
	feesAmount: number;
	totalAmount: number;
	accountUrl: string;
}

export const BookingConfirmationEmail: React.FC<
	BookingConfirmationEmailProps
> = ({
	confirmationId,
	guestName,
	roomName,
	checkInDate,
	checkOutDate,
	numberOfNights,
	numberOfGuests,
	guestEmail,
	guestPhone,
	specialRequests,
	baseAmount,
	taxAmount,
	feesAmount,
	totalAmount,
	accountUrl,
}) => {
	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
		}).format(amount);
	};

	return (
		<Html>
			<Head />
			<Preview>
				Booking Confirmed - {confirmationId} | Irishette Bed & Breakfast
			</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container className="mx-auto my-[40px] max-w-[600px] rounded border border-solid border-stone-300 bg-stone-100 p-[20px]">
						{/* Header */}
						<Section className="my-[20px] px-[32px] py-[20px]">
							<Row>
								<Column align="center">
									<Link href="https://irishette.com">
										<Img alt="Irishette Logo" height="150" src="#" />
									</Link>
									<Heading as="h1" className="text-4xl text-green-800 mb-2">
										Irishette Bed & Breakfast
									</Heading>
									<Text className="text-lg text-stone-600 mb-0">
										Your Home Away from Home
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Confirmation Message */}
						<Section className="mb-[32px] bg-green-50 border border-green-200 rounded-lg p-6">
							<Row>
								<Column className="text-center">
									<Heading
										as="h2"
										className="text-2xl font-bold text-green-800 mb-4"
									>
										🎉 Booking Confirmed!
									</Heading>
									<Text className="text-lg text-green-700 mb-2">
										Thank you for choosing Irishette Bed & Breakfast
									</Text>
									<Text className="text-base text-green-600 mb-4">
										Confirmation ID: <strong>{confirmationId}</strong>
									</Text>
									<Text className="text-sm text-green-600">
										Please save this confirmation email for your records
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Booking Details */}
						<Section className="mb-[32px]">
							<Row>
								<Column>
									<Heading
										as="h3"
										className="text-xl font-bold text-stone-900 mb-4 border-b border-stone-200 pb-2"
									>
										Booking Details
									</Heading>
								</Column>
							</Row>

							{/* Room & Dates */}
							<Row className="mb-4">
								<Column className="w-1/2 pr-4">
									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Room
									</Text>
									<Text className="text-base text-stone-900 mb-3">
										{roomName}
									</Text>

									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Guests
									</Text>
									<Text className="text-base text-stone-900 mb-3">
										{numberOfGuests} guest{numberOfGuests !== 1 ? 's' : ''}
									</Text>
								</Column>
								<Column className="w-1/2 pl-4">
									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Check-in
									</Text>
									<Text className="text-base text-stone-900 mb-3">
										{formatDate(checkInDate)}
									</Text>

									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Check-out
									</Text>
									<Text className="text-base text-stone-900 mb-3">
										{formatDate(checkOutDate)}
									</Text>
								</Column>
							</Row>

							<Row className="mb-4">
								<Column>
									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Length of Stay
									</Text>
									<Text className="text-base text-stone-900">
										{numberOfNights} night{numberOfNights !== 1 ? 's' : ''}
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Guest Information */}
						<Section className="mb-[32px]">
							<Row>
								<Column>
									<Heading
										as="h3"
										className="text-xl font-bold text-stone-900 mb-4 border-b border-stone-200 pb-2"
									>
										Guest Information
									</Heading>
								</Column>
							</Row>
							<Row className="mb-2">
								<Column className="w-1/2 pr-4">
									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Name
									</Text>
									<Text className="text-base text-stone-900">{guestName}</Text>
								</Column>
								<Column className="w-1/2 pl-4">
									<Text className="text-sm font-semibold text-stone-700 mb-1">
										Email
									</Text>
									<Text className="text-base text-stone-900">{guestEmail}</Text>
								</Column>
							</Row>
							{guestPhone && (
								<Row className="mb-2">
									<Column>
										<Text className="text-sm font-semibold text-stone-700 mb-1">
											Phone
										</Text>
										<Text className="text-base text-stone-900">
											{guestPhone}
										</Text>
									</Column>
								</Row>
							)}
							{specialRequests && (
								<Row className="mb-2">
									<Column>
										<Text className="text-sm font-semibold text-stone-700 mb-1">
											Special Requests
										</Text>
										<Text className="text-base text-stone-900">
											{specialRequests}
										</Text>
									</Column>
								</Row>
							)}
						</Section>

						{/* Pricing Breakdown */}
						<Section className="mb-[32px] bg-stone-50 border border-stone-200 rounded-lg p-6">
							<Row>
								<Column>
									<Heading
										as="h3"
										className="text-xl font-bold text-stone-900 mb-4"
									>
										Payment Summary
									</Heading>
								</Column>
							</Row>

							<Row className="mb-2">
								<Column className="w-2/3">
									<Text className="text-base text-stone-700">
										Room Rate ({numberOfNights} night
										{numberOfNights !== 1 ? 's' : ''})
									</Text>
								</Column>
								<Column className="w-1/3 text-right">
									<Text className="text-base text-stone-900">
										{formatCurrency(baseAmount)}
									</Text>
								</Column>
							</Row>

							{feesAmount > 0 && (
								<Row className="mb-2">
									<Column className="w-2/3">
										<Text className="text-base text-stone-700">
											Service Fee
										</Text>
									</Column>
									<Column className="w-1/3 text-right">
										<Text className="text-base text-stone-900">
											{formatCurrency(feesAmount)}
										</Text>
									</Column>
								</Row>
							)}

							{taxAmount > 0 && (
								<Row className="mb-4">
									<Column className="w-2/3">
										<Text className="text-base text-stone-700">Taxes</Text>
									</Column>
									<Column className="w-1/3 text-right">
										<Text className="text-base text-stone-900">
											{formatCurrency(taxAmount)}
										</Text>
									</Column>
								</Row>
							)}

							<Row className="border-t border-stone-300 pt-3">
								<Column className="w-2/3">
									<Text className="text-lg font-bold text-stone-900">
										Total Paid
									</Text>
								</Column>
								<Column className="w-1/3 text-right">
									<Text className="text-lg font-bold text-green-600">
										{formatCurrency(totalAmount)}
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Important Information */}
						<Section className="mb-[32px] bg-blue-50 border border-blue-200 rounded-lg p-6">
							<Row>
								<Column>
									<Heading
										as="h3"
										className="text-lg font-bold text-blue-900 mb-3"
									>
										Important Information
									</Heading>
									<Text className="text-sm text-blue-800 mb-2">
										<strong>Check-in:</strong> 3:00 PM - 8:00 PM
									</Text>
									<Text className="text-sm text-blue-800 mb-2">
										<strong>Check-out:</strong> 11:00 AM
									</Text>
									<Text className="text-sm text-blue-800 mb-2">
										<strong>Address:</strong> [Property Address] - Details will
										be provided closer to your arrival
									</Text>
									<Text className="text-sm text-blue-800">
										<strong>Contact:</strong> Please reply to this email if you
										have any questions or need to make changes to your
										reservation
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Action Button */}
						<Section className="mb-[24px] text-center">
							<Row>
								<Column>
									<Button
										className="box-border w-full max-w-[300px] rounded-[8px] bg-green-800 p-4 font-semibold text-white text-base"
										href={accountUrl}
									>
										View Booking Details
									</Button>
									<Text className="text-sm text-stone-600 mt-3">
										Manage your booking and view details in your account
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Footer */}
						<Section className="my-[24px] py-[24px] text-center border-t border-stone-300">
							<Row className="mt-[24px]">
								<Column className="text-center">
									<Img
										alt="Irishette Logo"
										width="80"
										src="#"
										className="mx-auto w-[80px]"
									/>
								</Column>
							</Row>
							<Row className="my-[12px]">
								<Column className="text-center">
									<Text className="my-[8px] text-[14px] leading-[24px] text-stone-600">
										Thank you for choosing Irishette Bed & Breakfast
									</Text>
									<Text className="text-[12px] leading-[20px] text-stone-500">
										We look forward to hosting you!
									</Text>
								</Column>
							</Row>
							<Row className="my-[12px]">
								<Column className="text-center">
									<Text className="my-[8px] text-[12px] leading-[24px] text-stone-500">
										Irishette Bed & Breakfast
									</Text>
									<Text className="mt-[4px] mb-0 text-[12px] leading-[24px] font-semibold text-stone-500">
										<Link href="mailto:info@irishette.com">
											info@irishette.com
										</Link>
									</Text>
								</Column>
							</Row>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};
