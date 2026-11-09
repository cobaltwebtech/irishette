import type * as React from 'react';
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
} from 'react-email';

import {
	BookingDetailsSection,
	type EmailBookingDetails,
} from './BookingDetailsSection';

interface BookingConfirmationEmailProps {
	booking: EmailBookingDetails;
	accountUrl: string;
	/** Public site URL (src/lib/site.ts SITE_URL). */
	siteUrl: string;
	/** Contact address shown in the footer (src/lib/site.ts CONTACT_EMAIL). */
	contactEmail: string;
}

export const BookingConfirmationEmail: React.FC<
	BookingConfirmationEmailProps
> = ({ booking, accountUrl, siteUrl, contactEmail }) => {
	const { confirmationId } = booking;
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
									<Link href={siteUrl}>
										<Img alt="Irishette Logo" height="150" src="#" />
									</Link>
									<Heading as="h1" className="mb-2 text-4xl text-green-800">
										Irishette Bed & Breakfast
									</Heading>
									<Text className="mb-0 text-lg text-stone-600">
										Your Home Away from Home
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Confirmation Message */}
						<Section className="mb-[32px] rounded-lg border border-green-200 bg-green-50 p-6">
							<Row>
								<Column className="text-center">
									<Heading
										as="h2"
										className="mb-4 text-2xl font-bold text-green-800"
									>
										🎉 Booking Confirmed!
									</Heading>
									<Text className="mb-2 text-lg text-green-700">
										Thank you for choosing Irishette Bed & Breakfast
									</Text>
									<Text className="mb-4 text-base text-green-600">
										Confirmation ID: <strong>{confirmationId}</strong>
									</Text>
									<Text className="text-sm text-green-600">
										Please save this confirmation email for your records
									</Text>
								</Column>
							</Row>
						</Section>

						<BookingDetailsSection booking={booking} />

						{/* Important Information */}
						<Section className="mb-[32px] rounded-lg border border-blue-200 bg-blue-50 p-6">
							<Row>
								<Column>
									<Heading
										as="h3"
										className="mb-3 text-lg font-bold text-blue-900"
									>
										Important Information
									</Heading>
									<Text className="mb-2 text-sm text-blue-800">
										<strong>Check-in:</strong> from {booking.checkInTime}
									</Text>
									<Text className="mb-2 text-sm text-blue-800">
										<strong>Check-out:</strong> by {booking.checkOutTime}
									</Text>
									<Text className="mb-2 text-sm text-blue-800">
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
										className="box-border w-full max-w-[300px] rounded-[8px] bg-green-800 p-4 text-base font-semibold text-white"
										href={accountUrl}
									>
										View Booking Details
									</Button>
									<Text className="mt-3 text-sm text-stone-600">
										Manage your booking and view details in your account
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Footer */}
						<Section className="my-[24px] border-t border-stone-300 py-[24px] text-center">
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
										<Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
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
