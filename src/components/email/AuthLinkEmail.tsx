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

import { EmailContactRow } from './EmailContactRow';

/** Props every auth link email receives from src/lib/email/email-service.ts. */
export interface AuthLinkEmailProps {
	url: string;
	/** Contact address shown in the footer (src/lib/site.ts CONTACT_EMAIL). */
	contactEmail: string;
	/** Link lifetime, e.g. "15 minutes" (src/lib/auth/auth-constants.ts). */
	expiresIn: string;
}

interface AuthLinkEmailLayoutProps extends AuthLinkEmailProps {
	preview: string;
	title: string;
	message: string;
	buttonLabel: string;
}

const NAV_LINKS = ['The Property', 'About', 'Bookings'];

/**
 * Shared layout for the emails that carry a one-time auth link
 * (magic link sign-in, password reset).
 */
export function AuthLinkEmail({
	url,
	contactEmail,
	expiresIn,
	preview,
	title,
	message,
	buttonLabel,
}: AuthLinkEmailLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border border-solid border-stone-300 bg-stone-100 p-[20px]">
						<Section className="my-[20px] px-[32px] py-[20px]">
							<Row>
								<Column align="center">
									<Link href="#">
										<Img alt="Irishette Logo" height="150" src="#" />
									</Link>
									<Heading as="h1" className="text-4xl">
										Irishette Bed & Breakfast
									</Heading>
								</Column>
							</Row>
							<Row>
								{NAV_LINKS.map((label) => (
									<Column key={label} align="center">
										<Link
											className="text-stone-600 [text-decoration:none]"
											href="#"
										>
											{label}
										</Link>
									</Column>
								))}
							</Row>
						</Section>
						<Section className="mb-[24px]">
							<Row>
								<Column className="text-center">
									<Text className="text-center text-xl font-bold text-stone-900">
										{title}
									</Text>
									<Text className="text-base text-stone-700">{message}</Text>
									<Button
										className="box-border w-full max-w-[200px] rounded-[8px] bg-green-800 p-3 font-semibold text-white"
										href={url}
									>
										{buttonLabel}
									</Button>
									<Text className="text-base text-stone-700">
										This link expires in {expiresIn}.
									</Text>
								</Column>
							</Row>
						</Section>
						<Section className="my-[24px] py-[24px] text-center">
							<Row className="mt-[24px]">
								<Column className="text-center">
									<Img
										alt="logo goes here"
										width="80"
										src="#"
										className="mx-auto w-[80px]"
									/>
								</Column>
							</Row>
							<Row className="my-[12px]">
								<Column className="text-center">
									<Link href="#">
										<Img
											alt="social logo goes here"
											height="64"
											src="#"
											width="64"
											className="mx-auto"
										/>
										<span className="text-[12px]">Social logo goes here</span>
									</Link>
								</Column>
							</Row>
							<EmailContactRow contactEmail={contactEmail} />
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
