import { createFileRoute } from '@tanstack/react-router';
import { Mail, MapPin, Phone } from 'lucide-react';
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
		<div className="min-h-screen bg-background">
			{/* Hero Section */}
			<section className="relative h-[40vh] min-h-[400px] flex items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
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
				<div className="relative z-10 container mx-auto max-w-4xl text-center px-4">
					<h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 text-white">
						Contact Us
					</h1>
					<p className="text-xl md:text-2xl italic text-popover mb-8 font-medium drop-shadow-md max-w-3xl mx-auto">
						We're here to help make your stay at Irishette unforgettable
					</p>
				</div>
			</section>

			{/* Contact Information & Form */}
			<section className="py-16 px-4">
				<div className="container mx-auto max-w-6xl">
					<div className="grid lg:grid-cols-2 gap-12">
						{/* Contact Information */}
						<div className="space-y-8">
							<div>
								<h2 className="text-3xl font-bold mb-6">Get in Touch</h2>
								<p className="text-muted-foreground text-lg leading-relaxed mb-8">
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
											<Mail className="w-6 h-6 text-accent mt-1" />
											<div>
												<h3 className="font-semibold text-lg mb-2">Email Us</h3>
												<p className="text-muted-foreground mb-2">
													For general inquiries and booking questions
												</p>
												<a
													href="mailto:info@irishette.com"
													className="text-accent hover:text-accent/80 font-medium"
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
											<Phone className="w-6 h-6 text-accent mt-1" />
											<div>
												<h3 className="font-semibold text-lg mb-2">Call Us</h3>
												<p className="text-muted-foreground mb-2">
													Speak directly with our friendly staff
												</p>
												<a
													href="tel:+1234567890"
													className="text-accent hover:text-accent/80 font-medium"
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
											<MapPin className="w-6 h-6 text-accent mt-1" />
											<div>
												<h3 className="font-semibold text-lg mb-2">Visit Us</h3>
												<p className="text-muted-foreground mb-2">
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
										<div className="grid md:grid-cols-2 gap-4">
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
												className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
												placeholder="Tell us more about your inquiry..."
											/>
										</div>

										<div className="space-y-4">
											<Button type="submit" className="w-full" size="lg">
												<Mail className="w-4 h-4 mr-2" />
												Send Message
											</Button>
											<p className="text-sm text-muted-foreground text-center">
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
			<section className="py-16 px-4 bg-muted/80">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="text-2xl text-center">
								Planning Your Visit?
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid md:grid-cols-2 gap-8 text-center">
								<div>
									<h3 className="font-semibold text-lg mb-3 text-accent">
										Check-in & Check-out
									</h3>
									<p className="text-muted-foreground">
										Check-in: 3:00 PM - 8:00 PM
										<br />
										Check-out: 11:00 AM
									</p>
								</div>
								<div>
									<h3 className="font-semibold text-lg mb-3 text-accent">
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
										className="text-accent hover:text-accent/80 font-medium"
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
