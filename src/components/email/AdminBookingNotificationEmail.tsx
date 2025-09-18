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
} from '@react-email/components';
import type * as React from 'react';

interface AdminBookingNotificationEmailProps {
	confirmationId: string;
	guestName: string;
	guestEmail: string;
	guestPhone?: string;
	roomName: string;
	checkInDate: string;
	checkOutDate: string;
	numberOfNights: number;
	numberOfGuests: number;
	specialRequests?: string;
	totalAmount: number;
	adminDashboardUrl: string;
}

export const AdminBookingNotificationEmail: React.FC<
	AdminBookingNotificationEmailProps
> = ({
	confirmationId,
	guestName,
	guestEmail,
	guestPhone,
	roomName,
	checkInDate,
	checkOutDate,
	numberOfNights,
	numberOfGuests,
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
							<Heading as="h1" className="text-2xl text-blue-900 mb-2">
								🏨 New Booking Alert
							</Heading>
							<Text className="text-sm text-blue-700 mb-0">
								Irishette Bed & Breakfast - Admin Notification
							</Text>
						</Section>

						{/* Booking Summary */}
						<Section className="mb-[24px] bg-white border border-blue-200 rounded-lg p-4">
							<Row>
								<Column>
									<Heading
										as="h2"
										className="text-lg font-bold text-blue-900 mb-3"
									>
										Booking Details
									</Heading>
								</Column>
							</Row>

							{/* Confirmation ID */}
							<Row className="mb-3">
								<Column>
									<Text className="text-xs font-semibold text-blue-700 mb-1">
										CONFIRMATION ID
									</Text>
									<Text className="text-sm font-bold text-blue-900 mb-0">
										{confirmationId}
									</Text>
								</Column>
							</Row>

							{/* Guest & Room Info */}
							<Row className="mb-3">
								<Column className="w-1/2 pr-2">
									<Text className="text-xs font-semibold text-blue-700 mb-1">
										GUEST
									</Text>
									<Text className="text-sm text-blue-900 mb-1">
										{guestName}
									</Text>
									<Text className="text-xs text-blue-600">{guestEmail}</Text>
									{guestPhone && (
										<Text className="text-xs text-blue-600">{guestPhone}</Text>
									)}
								</Column>
								<Column className="w-1/2 pl-2">
									<Text className="text-xs font-semibold text-blue-700 mb-1">
										ROOM
									</Text>
									<Text className="text-sm text-blue-900 mb-1">{roomName}</Text>
									<Text className="text-xs text-blue-600">
										{numberOfGuests} guest{numberOfGuests !== 1 ? 's' : ''}
									</Text>
								</Column>
							</Row>

							{/* Dates & Amount */}
							<Row className="mb-3">
								<Column className="w-1/2 pr-2">
									<Text className="text-xs font-semibold text-blue-700 mb-1">
										DATES
									</Text>
									<Text className="text-sm text-blue-900 mb-1">
										{formatDate(checkInDate)}
									</Text>
									<Text className="text-sm text-blue-900 mb-1">
										to {formatDate(checkOutDate)}
									</Text>
									<Text className="text-xs text-blue-600">
										{numberOfNights} night{numberOfNights !== 1 ? 's' : ''}
									</Text>
								</Column>
								<Column className="w-1/2 pl-2">
									<Text className="text-xs font-semibold text-blue-700 mb-1">
										TOTAL PAID
									</Text>
									<Text className="text-lg font-bold text-green-600">
										{formatCurrency(totalAmount)}
									</Text>
								</Column>
							</Row>

							{/* Special Requests */}
							{specialRequests && (
								<Row className="mb-2">
									<Column>
										<Text className="text-xs font-semibold text-blue-700 mb-1">
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
										className="box-border w-full rounded-[6px] bg-blue-700 px-4 py-3 font-semibold text-white text-sm"
										href={adminDashboardUrl}
									>
										View in Admin Dashboard
									</Button>
								</Column>
							</Row>
						</Section>

						{/* Quick Actions */}
						<Section className="mb-[20px] bg-gray-50 border border-gray-200 rounded-lg p-3">
							<Row>
								<Column>
									<Text className="text-xs font-semibold text-gray-700 mb-2">
										QUICK ACTIONS
									</Text>
									<Text className="text-xs text-gray-600 mb-1">
										• Check room availability calendar
									</Text>
									<Text className="text-xs text-gray-600 mb-1">
										• Prepare welcome materials
									</Text>
									<Text className="text-xs text-gray-600 mb-0">
										• Update housekeeping schedule
									</Text>
								</Column>
							</Row>
						</Section>

						{/* Footer */}
						<Section className="my-[16px] py-[16px] text-center border-t border-blue-200">
							<Row>
								<Column>
									<Text className="text-xs text-blue-600 mb-1">
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
