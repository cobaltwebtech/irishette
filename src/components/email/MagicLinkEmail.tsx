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

interface MagicLinkEmailProps {
	url: string;
}

export const MagicLinkEmail: React.FC<MagicLinkEmailProps> = ({ url }) => {
	return (
		<Html>
			<Head />
			<Preview>Login to Irishette</Preview>
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
								<Column align="center">
									<Link
										className="text-stone-600 [text-decoration:none]"
										href="#"
									>
										The Property
									</Link>
								</Column>
								<Column align="center">
									<Link
										className="text-stone-600 [text-decoration:none]"
										href="#"
									>
										About
									</Link>
								</Column>
								<Column align="center">
									<Link
										className="text-stone-600 [text-decoration:none]"
										href="#"
									>
										Bookings
									</Link>
								</Column>
							</Row>
						</Section>
						<Section className="mb-[24px]">
							<Row>
								<Column className="text-center">
									<Text className="text-center text-xl font-bold text-stone-900">
										Your Magic Link to Login
									</Text>
									<Text className="text-base text-stone-700">
										Click the link below to login to your account.
									</Text>
									<Button
										className="box-border w-full max-w-[200px] rounded-[8px] bg-green-800 p-3 font-semibold text-white"
										href={url}
									>
										Login to Irishette
									</Button>
									<Text className="text-base text-stone-700">
										Link will expire in five minutes.
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
