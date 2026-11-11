import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Heading,
	Html,
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
import { EmailLogo, type EmailBrandProps } from './EmailLogo';

// A booking update for the guest or the admins (cancellation, refund,
// failed payment): a message, an optional highlighted section (e.g. the
// refund details) and the full booking details.

export interface BookingNoticeEmailProps extends EmailBrandProps {
	preview: string;
	heading: string;
	paragraphs: string[];
	/** Highlighted rows above the booking details (e.g. the refund). */
	highlight?: {
		title: string;
		rows: Array<{ label: string; value: string }>;
	};
	booking: EmailBookingDetails;
	button?: { label: string; href: string };
	/** 'alert' renders an amber frame (admin copies). */
	tone?: 'info' | 'alert';
	contactEmail: string;
}

export function BookingNoticeEmail({
	logoUrl,
	siteUrl,
	preview,
	heading,
	paragraphs,
	highlight,
	booking,
	button,
	tone = 'info',
	contactEmail,
}: BookingNoticeEmailProps) {
	const frame =
		tone === 'alert'
			? 'border-amber-300 bg-amber-50'
			: 'border-stone-300 bg-stone-100';
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container
						className={`mx-auto my-[40px] max-w-[600px] rounded border border-solid p-[20px] ${frame}`}
					>
						<Section className="my-[20px] text-center">
							<EmailLogo logoUrl={logoUrl} siteUrl={siteUrl} size={72} />
							<Heading as="h1" className="mb-2 text-2xl text-stone-900">
								{heading}
							</Heading>
							<Text className="mb-0 text-sm text-stone-600">
								Irishette Bed &amp; Breakfast
							</Text>
						</Section>
						{paragraphs.map((p) => (
							<Text
								key={p}
								className="text-[14px] leading-[22px] text-stone-800"
							>
								{p}
							</Text>
						))}
						{highlight && (
							<Section className="my-[24px] rounded-lg border border-solid border-stone-300 bg-white p-[16px]">
								<Heading
									as="h3"
									className="mt-0 mb-3 text-lg font-bold text-stone-900"
								>
									{highlight.title}
								</Heading>
								{highlight.rows.map((row) => (
									<Row key={row.label}>
										<Column className="w-[45%] py-[2px] text-[13px] text-stone-600">
											{row.label}
										</Column>
										<Column className="py-[2px] text-[13px] font-semibold text-stone-900">
											{row.value}
										</Column>
									</Row>
								))}
							</Section>
						)}
						<BookingDetailsSection booking={booking} />
						{button && (
							<Section className="my-[24px] text-center">
								<Button
									href={button.href}
									className="box-border rounded-[8px] bg-green-800 px-5 py-3 text-center text-[14px] font-semibold text-white no-underline"
								>
									{button.label}
								</Button>
							</Section>
						)}
						<Section className="border-t border-stone-300 pt-[16px] text-center">
							<Text className="my-0 text-[12px] text-stone-500">
								Questions?{' '}
								<Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
