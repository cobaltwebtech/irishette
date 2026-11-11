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

export interface NotificationEmailProps extends EmailBrandProps {
	preview: string;
	heading: string;
	paragraphs: string[];
	details?: Array<{ label: string; value: string }>;
	button?: { label: string; href: string };
	/** 'alert' renders an amber frame for admin warnings. */
	tone?: 'info' | 'alert';
}

/**
 * Generic transactional email: cancellations, refunds and admin alerts.
 * Callers pass plain strings; React escapes them.
 */
export function NotificationEmail({
	logoUrl,
	siteUrl,
	preview,
	heading,
	paragraphs,
	details = [],
	button,
	tone = 'info',
}: NotificationEmailProps) {
	const frame =
		tone === 'alert'
			? 'border-amber-300 bg-amber-50'
			: 'border-[#eaeaea] bg-white';
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container
						className={`mx-auto my-[40px] max-w-[500px] rounded border border-solid p-[20px] ${frame}`}
					>
						<Section className="my-[20px] text-center">
							<EmailLogo logoUrl={logoUrl} siteUrl={siteUrl} size={72} />
							<Heading as="h1" className="mb-2 text-2xl text-gray-900">
								{heading}
							</Heading>
							<Text className="mb-0 text-sm text-gray-600">
								Irishette Bed &amp; Breakfast
							</Text>
						</Section>
						{paragraphs.map((p) => (
							<Text
								key={p}
								className="text-[14px] leading-[22px] text-gray-800"
							>
								{p}
							</Text>
						))}
						{details.length > 0 && (
							<Section className="my-[16px] rounded bg-gray-50 p-[12px]">
								{details.map((d) => (
									<Row key={d.label}>
										<Column className="w-[45%] text-[13px] text-gray-600">
											{d.label}
										</Column>
										<Column className="text-[13px] font-semibold text-gray-900">
											{d.value}
										</Column>
									</Row>
								))}
							</Section>
						)}
						{button && (
							<Section className="my-[24px] text-center">
								<Button
									href={button.href}
									className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
								>
									{button.label}
								</Button>
							</Section>
						)}
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
