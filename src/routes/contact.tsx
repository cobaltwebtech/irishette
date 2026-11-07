import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/contact')({
	head: () => ({
		meta: [
			{
				title: 'Contact Us | Irishette.com',
			},
			{
				name: 'description',
				content:
					"Get in touch with Irishette Bed & Breakfast. We're here to help with your booking questions and travel planning.",
			},
		],
	}),
	component: ContactPage,
});

function ContactPage() {
	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const phoneId = useId();
	const subjectId = useId();
	const messageId = useId();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		// TODO: Integrate with Resend email service
		console.log('Contact form submitted - TODO: Implement Resend integration');
	};

	return (
		<div className="bg-background">
			{/* Hero Section */}
			<section className="relative flex h-[40vh] min-h-[400px] items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
				{/* Background Image - using one of the existing room images as placeholder */}
				<div
					className="absolute inset-0 bg-cover bg-center bg-no-repeat"
					style={{
						backgroundImage: `url('https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/texas-room/9abc8cd6-f843-4e67-9142-eb473adff4f5.jpg')`,
					}}
				/>

				{/* Overlay for better text readability */}
				<div className="absolute inset-0 bg-black/60" />

				{/* Content */}
				<div className="relative z-10 container mx-auto max-w-4xl px-4 text-center">
					<h1 className="mb-6 text-4xl font-black text-white md:text-6xl lg:text-7xl">
						Contact Us
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-xl font-medium text-popover italic drop-shadow-md md:text-2xl">
						We're here to help make your stay at Irishette unforgettable
					</p>
				</div>
			</section>

			{/* Contact Information & Form */}
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-6xl">
					<div className="grid gap-12 lg:grid-cols-2">
						{/* Contact Information */}
						<div className="space-y-8">
							<div>
								<h2 className="mb-6 text-3xl font-bold">Get in Touch</h2>
								<p className="mb-8 text-lg leading-relaxed text-muted-foreground">
									Have questions about your stay, need help with booking, or
									want to know more about our amenities? We'd love to hear from
									you! Our team is here to ensure you have the perfect Dublin,
									Texas getaway.
								</p>
							</div>

							{/* Contact Cards */}
							<div className="space-y-6">
								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:mail"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Email Us</h3>
												<p className="mb-2 text-muted-foreground">
													For general inquiries and booking questions
												</p>
												<a
													href="mailto:info@irishette.com"
													className="font-medium text-accent hover:text-accent/80"
												>
													info@irishette.com
												</a>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:phone"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Call Us</h3>
												<p className="mb-2 text-muted-foreground">
													Speak directly with our friendly staff
												</p>
												<a
													href="tel:+1234567890"
													className="font-medium text-accent hover:text-accent/80"
												>
													(123) 456-7890
												</a>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:map-pin"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Visit Us</h3>
												<p className="mb-2 text-muted-foreground">
													Located in historic Dublin, Texas
												</p>
												<address className="text-accent not-italic">
													123 Historic Street
													<br />
													Dublin, TX 76446
												</address>
											</div>
										</div>
									</CardContent>
								</Card>
							</div>
						</div>

						{/* Contact Form */}
						<div>
							<Card className="border-accent/20">
								<CardHeader>
									<CardTitle className="text-2xl">Send Us a Message</CardTitle>
									<CardDescription>
										Fill out the form below and we'll get back to you as soon as
										possible.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<form onSubmit={handleSubmit} className="space-y-6">
										<div className="grid gap-4 md:grid-cols-2">
											<div className="space-y-2">
												<Label htmlFor={firstNameId}>First Name *</Label>
												<Input
													id={firstNameId}
													name="firstName"
													required
													placeholder="Your first name"
												/>
											</div>
											<div className="space-y-2">
												<Label htmlFor={lastNameId}>Last Name *</Label>
												<Input
													id={lastNameId}
													name="lastName"
													required
													placeholder="Your last name"
												/>
											</div>
										</div>

										<div className="space-y-2">
											<Label htmlFor={emailId}>Email Address *</Label>
											<Input
												id={emailId}
												name="email"
												type="email"
												required
												placeholder="your.email@example.com"
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor={phoneId}>Phone Number</Label>
											<Input
												id={phoneId}
												name="phone"
												type="tel"
												placeholder="(123) 456-7890"
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor={subjectId}>Subject *</Label>
											<Input
												id={subjectId}
												name="subject"
												required
												placeholder="What can we help you with?"
											/>
										</div>

										<div className="space-y-2">
											<Label htmlFor={messageId}>Message *</Label>
											<textarea
												id={messageId}
												name="message"
												required
												rows={5}
												className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
												placeholder="Tell us more about your inquiry..."
											/>
										</div>

										<div className="space-y-4">
											<Button type="submit" className="w-full" size="lg">
												<Icon icon="tabler:send" className="size-5" />
												Send Message
											</Button>
											<p className="text-center text-sm text-muted-foreground">
												* Required fields. We typically respond within 24 hours.
											</p>
										</div>
									</form>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</section>

			{/* Additional Information */}
			<section className="bg-secondary px-4 py-16">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="text-center text-2xl">
								Planning Your Visit?
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-8 text-center md:grid-cols-2">
								<div>
									<h3 className="mb-3 text-lg font-semibold text-accent">
										Check-in & Check-out
									</h3>
									<p className="text-muted-foreground">
										Check-in: 3:00 PM - 8:00 PM
										<br />
										Check-out: 11:00 AM
									</p>
								</div>
								<div>
									<h3 className="mb-3 text-lg font-semibold text-accent">
										Cancellation Policy
									</h3>
									<p className="text-muted-foreground">
										UPDATE CANCELLATION POLICY.
										<br />
										Contact us for special circumstances.
									</p>
								</div>
							</div>
							<div className="mt-8 text-center">
								<p className="text-muted-foreground">
									For immediate assistance with existing reservations, please
									call us directly at{' '}
									<a
										href="tel:+1234567890"
										className="font-medium text-accent hover:text-accent/80"
									>
										(123) 456-7890
									</a>
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
