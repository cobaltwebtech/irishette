import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/terms-of-service')({
	head: () => ({
		meta: [
			{
				title: 'Terms of Service | Irishette.com',
			},
		],
	}),
	component: TermsOfServicePage,
});

function TermsOfServicePage() {
	// Scroll to top when component mounts
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-5xl font-bold mb-4">
						Terms of Service
					</h1>
					<p className="text-lg text-muted-foreground">
						Last Updated: October 16, 2025
					</p>
				</div>
			</section>

			{/* Terms Content */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl">
					<Card>
						<CardContent>
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									1. Agreement to Terms
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									Welcome to irishette.com. By accessing or using our website
									and booking services, you agree to be bound by these Terms of
									Service ("Terms"). If you do not agree to these Terms, please
									do not use our services.
								</p>
								<p className="text-muted-foreground leading-relaxed">
									These Terms constitute a legally binding agreement between you
									and irishette.com ("we," "us," or "our").
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									2. Description of Services
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									irishette.com provides an online booking platform for bed and
									breakfast lodging accommodations. Our services include:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Online room reservations</li>
									<li>Booking management</li>
									<li>Guest communication</li>
									<li>Payment processing through third-party providers</li>
								</ul>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">3. Eligibility</h2>
								<p className="text-muted-foreground leading-relaxed">
									You must be at least 18 years of age to make a booking through
									our website. By using our services, you represent and warrant
									that you meet this age requirement and have the legal capacity
									to enter into these Terms.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									4. Bookings and Reservations
								</h2>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									4.1 Booking Process
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									When you make a reservation through our website, you are
									making an offer to book accommodations. Your booking is
									confirmed only when you receive a confirmation email from us.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									4.2 Accuracy of Information
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									You agree to provide accurate, current, and complete
									information during the booking process. You are responsible
									for maintaining the accuracy of your contact information.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									4.3 Booking Modifications
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Any changes to your reservation must be requested by
									contacting us directly. Modifications are subject to
									availability and may incur additional fees.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									5. Pricing and Payment
								</h2>
								<h3 className="text-xl font-semibold mb-3 mt-6">5.1 Pricing</h3>
								<p className="text-muted-foreground leading-relaxed">
									All prices are listed in United States Dollars (USD) and are
									subject to change without notice. The price confirmed at the
									time of your booking will be honored.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">5.2 Payment</h3>
								<p className="text-muted-foreground leading-relaxed">
									Payment is processed securely through Stripe. By providing
									payment information, you authorize us to charge the total
									amount of your booking to your payment method.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									5.3 Payment Processing
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									All payment processing is subject to Stripe's Terms of Service
									and Privacy Policy. We do not store your complete payment card
									information.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									6. Cancellation and Refund Policy
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									All cancellations and refunds are subject to our Cancellation
									and Refund Policy, which can be found at{' '}
									<Link
										to="/cancellation-refund-policy"
										className="text-accent underline"
									>
										Cancellation and Refund Policy
									</Link>
									. Please review this policy carefully before making a booking,
									as it contains important information about cancellation
									deadlines, refund eligibility, and procedures.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									7. Guest Responsibilities
								</h2>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									7.1 Property Rules
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Guests must comply with all posted property rules and
									regulations during their stay, including:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Respecting quiet hours</li>
									<li>No smoking in designated non-smoking areas</li>
									<li>Maximum occupancy limits</li>
									<li>Pet policies (if applicable)</li>
									<li>Proper use of facilities and amenities</li>
								</ul>
								<h3 className="text-xl font-semibold mb-3 mt-6">7.2 Conduct</h3>
								<p className="text-muted-foreground leading-relaxed">
									You agree to conduct yourself in a respectful manner and not
									engage in any illegal activities, disruptive behavior, or
									actions that may disturb other guests or damage property.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">7.3 Damages</h3>
								<p className="text-muted-foreground leading-relaxed">
									You are responsible for any damage to the property or its
									contents caused by you or members of your party. We reserve
									the right to charge your payment method for repair or
									replacement costs.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									8. Liability and Disclaimers
								</h2>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									8.1 Use at Your Own Risk
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									You use our services and accommodations at your own risk. We
									strive to provide accurate information, but we make no
									warranties regarding the completeness, accuracy, or
									reliability of any content on our website.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									8.2 Limitation of Liability
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									To the fullest extent permitted by law, irishette.com shall
									not be liable for any indirect, incidental, special,
									consequential, or punitive damages, including but not limited
									to loss of profits, data, or goodwill, arising from:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Your use or inability to use our services</li>
									<li>Unauthorized access to your information</li>
									<li>Errors or interruptions in our service</li>
									<li>Personal injury or property damage during your stay</li>
								</ul>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									8.3 Maximum Liability
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Our total liability to you for any claims arising from your
									use of our services shall not exceed the total amount you paid
									for your booking.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">9. Indemnification</h2>
								<p className="text-muted-foreground leading-relaxed">
									You agree to indemnify, defend, and hold harmless
									irishette.com, its owners, employees, and agents from any
									claims, damages, losses, liabilities, and expenses (including
									reasonable attorney's fees) arising from:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Your violation of these Terms</li>
									<li>Your use of our services</li>
									<li>Your violation of any rights of third parties</li>
									<li>Your conduct during your stay</li>
								</ul>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									10. Intellectual Property
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									All content on irishette.com, including text, graphics, logos,
									images, and software, is the property of irishette.com or its
									licensors and is protected by United States and international
									copyright, trademark, and other intellectual property laws.
								</p>
								<p className="text-muted-foreground leading-relaxed">
									You may not reproduce, distribute, modify, or create
									derivative works from our content without our express written
									permission.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									11. Third-Party Services
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									Our website may contain links to third-party websites or
									services (such as Stripe for payment processing). We are not
									responsible for the content, privacy practices, or terms of
									service of these third parties. Your interactions with
									third-party services are governed by their respective terms
									and policies.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">12. Privacy</h2>
								<p className="text-muted-foreground leading-relaxed">
									Your use of our services is also governed by our{' '}
									<Link to="/privacy-policy" className="text-accent underline">
										Privacy Policy
									</Link>
									, which is incorporated into these Terms by reference. Please
									review our Privacy Policy to understand our data practices.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									13. Modifications to Terms
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									We reserve the right to modify these Terms at any time.
									Changes will be effective immediately upon posting to our
									website with an updated "Last Updated" date. Your continued
									use of our services after changes are posted constitutes
									acceptance of the modified Terms.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">14. Termination</h2>
								<p className="text-muted-foreground leading-relaxed">
									We reserve the right to refuse service, terminate accounts, or
									cancel reservations at our sole discretion, including for
									violation of these Terms or any applicable laws.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									15. Governing Law and Dispute Resolution
								</h2>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									15.1 Governing Law
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									These Terms shall be governed by and construed in accordance
									with the laws of the State of Texas and the United States of
									America, without regard to conflict of law principles.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									15.2 Jurisdiction
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Any legal action or proceeding arising out of or relating to
									these Terms or your use of our services shall be brought
									exclusively in the state or federal courts located in Texas,
									and you consent to the personal jurisdiction of such courts.
								</p>
								<h3 className="text-xl font-semibold mb-3 mt-6">
									15.3 Dispute Resolution
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Before filing any legal action, you agree to attempt to
									resolve any dispute informally by contacting us. If a dispute
									cannot be resolved within 30 days, either party may pursue
									formal legal remedies.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">16. Severability</h2>
								<p className="text-muted-foreground leading-relaxed">
									If any provision of these Terms is found to be unenforceable
									or invalid, that provision shall be limited or eliminated to
									the minimum extent necessary, and the remaining provisions
									shall remain in full force and effect.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									17. Entire Agreement
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									These Terms, together with our Privacy Policy, constitute the
									entire agreement between you and irishette.com regarding your
									use of our services and supersede any prior agreements.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">18. Waiver</h2>
								<p className="text-muted-foreground leading-relaxed">
									Our failure to enforce any right or provision of these Terms
									shall not constitute a waiver of such right or provision.
								</p>
							</section>

							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									19. Contact Information
								</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									If you have any questions about these Terms of Service, please
									contact us at:
								</p>
								<p className="text-muted-foreground">
									<strong>Email:</strong> info@irishette.com
								</p>
								<p className="text-muted-foreground">
									<strong>Address:</strong> [Your Physical Address]
								</p>
								<p className="text-muted-foreground">
									<strong>Phone:</strong> [Your Phone Number]
								</p>
							</section>

							<section className="mb-8 p-4 bg-muted/30 rounded-lg border border-primary/20">
								<p className="text-sm text-muted-foreground leading-relaxed">
									By using irishette.com and making a booking, you acknowledge
									that you have read, understood, and agree to be bound by these
									Terms of Service.
								</p>
							</section>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
