import type * as React from 'react';
import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Row,
	Section,
	Tailwind,
	Text,
} from 'react-email';

import { EmailLogo, type EmailBrandProps } from './EmailLogo';

interface AdminBookingNotificationEmailProps extends EmailBrandProps {
	confirmationId: string;
	guestName: string;
	guestEmail: string;
	guestPhone?: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	/** Estimated arrival window, e.g. "5:00 PM - 6:00 PM"; null on older bookings. */
	estimatedArrival?: string | null;
	specialRequests?: string;
	totalAmount: number;
	adminDashboardUrl: string;
}

/** The guest's arrival window: the hosts meet every guest in person. */
function EstimatedArrivalRow({
	estimatedArrival,
}: {
	estimatedArrival?: string | null;
}) {
	if (!estimatedArrival) return null;
	return (
		<Row className="mb-3">
			<Column>
				<Text className="mb-1 text-xs font-semibold text-blue-700">
					ESTIMATED ARRIVAL
				</Text>
				<Text className="text-sm text-blue-900">{estimatedArrival}</Text>
			</Column>
		</Row>
	);
}

export const AdminBookingNotificationEmail: React.FC<
	AdminBookingNotificationEmailProps
> = ({
	logoUrl,
	siteUrl,
	confirmationId,
	guestName,
	guestEmail,
	guestPhone,
	roomName,
	checkInDate,
	checkOutDate,
	numberOfNights,
	numberOfGuests,
	estimatedArrival,
	specialRequests,
	totalAmount,
	adminDashboardUrl,
}) => {
	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
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
				New Booking: {confirmationId} - {guestName} | Irishette Admin
			</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container className="mx-auto my-[40px] max-w-[500px] rounded border border-solid border-blue-300 bg-blue-50 p-[20px]">
						{/* Header */}
						<Section className="my-[20px] text-center">
							<EmailLogo logoUrl={logoUrl} siteUrl={siteUrl} size={72} />
							<Heading as="h1" className="mb-2 text-2xl text-blue-900">
								🏨 New Booking Alert
							</Heading>
							<Text className="mb-0 text-sm text-blue-700">
								Irishette Bed & Breakfast - Admin Notification
							</Text>
						</Section>

						{/* Booking Summary */}
						<Section className="mb-[24px] rounded-lg border border-blue-200 bg-white p-4">
							<Row>
								<Column>
									<Heading
										as="h2"
										className="mb-3 text-lg font-bold text-blue-900"
									>
										Booking Details
									</Heading>
								</Column>
							</Row>

							{/* Confirmation ID */}
							<Row className="mb-3">
								<Column>
									<Text className="mb-1 text-xs font-semibold text-blue-700">
										CONFIRMATION ID
									</Text>
									<Text className="mb-0 text-sm font-bold text-blue-900">
										{confirmationId}
									</Text>
								</Column>
							</Row>

							{/* Guest & Room Info */}
							<Row className="mb-3">
								<Column className="w-1/2 pr-2">
									<Text className="mb-1 text-xs font-semibold text-blue-700">
										GUEST
									</Text>
									<Text className="mb-1 text-sm text-blue-900">
										{guestName}
									</Text>
									<Text className="text-xs text-blue-600">{guestEmail}</Text>
									{guestPhone && (
										<Text className="text-xs text-blue-600">{guestPhone}</Text>
									)}
								</Column>
								<Column className="w-1/2 pl-2">
									<Text className="mb-1 text-xs font-semibold text-blue-700">
										ROOM
									</Text>
									<Text className="mb-1 text-sm text-blue-900">{roomName}</Text>
									<Text className="text-xs text-blue-600">
										{numberOfGuests} guest{numberOfGuests !== 1 ? 's' : ''}
									</Text>
								</Column>
							</Row>

							{/* Dates & Amount */}
							<Row className="mb-3">
								<Column className="w-1/2 pr-2">
									<Text className="mb-1 text-xs font-semibold text-blue-700">
										DATES
									</Text>
									<Text className="mb-1 text-sm text-blue-900">
										{formatDate(checkInDate)}
									</Text>
									<Text className="mb-1 text-sm text-blue-900">
										to {formatDate(checkOutDate)}
									</Text>
									<Text className="text-xs text-blue-600">
										{numberOfNights} night{numberOfNights !== 1 ? 's' : ''}
									</Text>
								</Column>
								<Column className="w-1/2 pl-2">
									<Text className="mb-1 text-xs font-semibold text-blue-700">
										TOTAL PAID
									</Text>
									<Text className="text-lg font-bold text-green-600">
										{formatCurrency(totalAmount)}
									</Text>
								</Column>
							</Row>

							<EstimatedArrivalRow estimatedArrival={estimatedArrival} />

							{/* Special Requests */}
							{specialRequests && (
								<Row className="mb-2">
									<Column>
										<Text className="mb-1 text-xs font-semibold text-blue-700">
											SPECIAL REQUESTS
										</Text>
										<Text className="text-sm text-blue-900 italic">
											"{specialRequests}"
										</Text>
									</Column>
								</Row>
							)}
						</Section>

						{/* Action Button */}
						<Section className="mb-[24px] text-center">
							<Row>
								<Column>
									<Button
										className="box-border w-full rounded-[6px] bg-blue-700 px-4 py-3 text-sm font-semibold text-white"
										href={adminDashboardUrl}
									>
										View in Admin Dashboard
									</Button>
								</Column>
							</Row>
						</Section>

						{/* Quick Actions */}
						<Section className="mb-[20px] rounded-lg border border-gray-200 bg-gray-50 p-3">
							<Row>
								<Column>
									<Text className="mb-2 text-xs font-semibold text-gray-700">
										QUICK ACTIONS
									</Text>
									<Text className="mb-1 text-xs text-gray-600">
										• Check room availability calendar
									</Text>
									<Text className="mb-1 text-xs text-gray-600">
										• Prepare welcome materials
									</Text>
									<Text className="mb-0 text-xs text-gray-600">
										• Update housekeeping schedule
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Footer */}
						<Section className="my-[16px] border-t border-blue-200 py-[16px] text-center">
							<Row>
								<Column>
									<Text className="mb-1 text-xs text-blue-600">
										Irishette Bed & Breakfast Admin System
									</Text>
									<Text className="text-xs text-blue-500">
										This notification was sent automatically when payment was
										confirmed
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
