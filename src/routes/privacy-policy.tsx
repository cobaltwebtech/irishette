import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/privacy-policy')({
	head: () => ({
		meta: [
			{
				title: 'Privacy Policy | Irishette.com',
			},
		],
	}),
	component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-5xl font-bold mb-4">
						Privacy Policy
					</h1>
					<p className="text-lg text-muted-foreground">
						Last Updated: October 16, 2025
					</p>
				</div>
			</section>

			{/* Privacy Policy Content */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl">
					<Card>
						<CardContent>
							{/* Introduction */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Introduction</h2>
								<p className="text-muted-foreground leading-relaxed">
									Welcome to irishette.com ("we," "our," or "us"). We are
									committed to protecting your privacy and handling your
									personal information with care and respect. This Privacy
									Policy explains how we collect, use, store, and protect your
									information when you use our bed and breakfast booking
									services.
								</p>
							</section>

							{/* Information We Collect */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Information We Collect
								</h2>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Personal Information You Provide
								</h3>
								<p className="text-muted-foreground leading-relaxed mb-3">
									When you make a booking through our website, we collect:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>
										<strong>Contact Information:</strong> Name, email address,
										and phone number
									</li>
									<li>
										<strong>Guest Information:</strong> Details about additional
										guests in your party
									</li>
									<li>
										<strong>Booking Details:</strong> Check-in/check-out dates,
										room preferences, and special requests
									</li>
									<li>
										<strong>Payment Information:</strong> Processed exclusively
										through Stripe (see Payment Processing section below)
									</li>
								</ul>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Automatically Collected Information
								</h3>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We may automatically collect certain technical information
									when you visit our website, including:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Browser type and version</li>
									<li>Device information</li>
									<li>IP address</li>
									<li>Pages visited and time spent on our site</li>
								</ul>
							</section>

							{/* How We Use Your Information */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									How We Use Your Information
								</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We use your personal information solely for the following
									purposes:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>
										<strong>Booking Management:</strong> To process and confirm
										your reservations
									</li>
									<li>
										<strong>Communication:</strong> To send booking
										confirmations, updates, and respond to your inquiries
									</li>
									<li>
										<strong>Service Delivery:</strong> To provide the lodging
										services you've requested
									</li>
									<li>
										<strong>Operational Purposes:</strong> To improve our
										services and website functionality
									</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									We do <strong>not</strong> use your information for marketing
									purposes unless you explicitly opt in to receive promotional
									communications.
								</p>
							</section>

							{/* Payment Processing */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Payment Processing</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									All payment transactions are processed by{' '}
									<strong>Stripe, Inc.</strong> Payment card information is
									collected and processed directly by Stripe and is subject to{' '}
									<a
										href="https://stripe.com/privacy"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										Stripe's Privacy Policy
									</a>{' '}
									and{' '}
									<a
										href="https://stripe.com/legal"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										Terms of Service
									</a>
									.
								</p>
								<p className="text-muted-foreground leading-relaxed font-semibold">
									Important: We do not store, process, or have access to your
									complete payment card information on our servers. Only Stripe
									handles your payment data in accordance with PCI-DSS security
									standards.
								</p>
							</section>

							{/* Data Storage and Security */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Data Storage and Security
								</h2>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Where We Store Your Data
								</h3>
								<p className="text-muted-foreground leading-relaxed mb-3">
									Your personal information (excluding payment data) is stored
									securely using:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Cloudflare's database services</li>
									<li>Cloudflare Workers platform</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									These services provide enterprise-grade security and data
									protection measures.
								</p>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Security Measures
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									We implement appropriate technical and organizational measures
									to protect your personal information against unauthorized
									access, alteration, disclosure, or destruction. However, no
									method of transmission over the internet or electronic storage
									is 100% secure.
								</p>
							</section>

							{/* Information Sharing */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Information Sharing</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We respect your privacy and do <strong>not</strong> sell,
									rent, or trade your personal information to third parties.
								</p>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We only share your information in the following limited
									circumstances:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>
										<strong>Service Delivery:</strong> With service providers
										necessary to fulfill your booking (e.g., housekeeping,
										maintenance)
									</li>
									<li>
										<strong>Legal Requirements:</strong> When required by law,
										court order, or government regulation
									</li>
									<li>
										<strong>Business Transfers:</strong> In the event of a
										merger, acquisition, or sale of assets (you would be
										notified of any such change)
									</li>
								</ul>
							</section>

							{/* Data Retention */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Data Retention</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We retain your personal information only for as long as
									necessary to:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Fulfill the purposes outlined in this Privacy Policy</li>
									<li>
										Comply with legal, accounting, or reporting requirements
									</li>
									<li>Resolve disputes and enforce our agreements</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									Once your information is no longer needed, we will securely
									delete or anonymize it.
								</p>
							</section>

							{/* Your Rights */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Your Rights</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									Depending on your location, you may have the following rights
									regarding your personal information:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>
										<strong>Access:</strong> Request a copy of the personal
										information we hold about you
									</li>
									<li>
										<strong>Correction:</strong> Request correction of
										inaccurate or incomplete information
									</li>
									<li>
										<strong>Deletion:</strong> Request deletion of your personal
										information (subject to legal obligations)
									</li>
									<li>
										<strong>Objection:</strong> Object to our processing of your
										information
									</li>
									<li>
										<strong>Data Portability:</strong> Receive your information
										in a structured, commonly used format
									</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									To exercise any of these rights, please contact us using the
									information provided below.
								</p>
							</section>

							{/* Cookies and Tracking Technologies */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Cookies and Tracking Technologies
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									Our website may use cookies and similar tracking technologies
									to enhance your browsing experience. You can control cookie
									preferences through your browser settings. Please note that
									disabling cookies may affect the functionality of our website.
								</p>
							</section>

							{/* Third-Party Links */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Third-Party Links</h2>
								<p className="text-muted-foreground leading-relaxed">
									Our website may contain links to third-party websites. We are
									not responsible for the privacy practices or content of these
									external sites. We encourage you to review the privacy
									policies of any third-party sites you visit.
								</p>
							</section>

							{/* Children's Privacy */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Children's Privacy</h2>
								<p className="text-muted-foreground leading-relaxed">
									Our services are not directed to individuals under the age of
									18. We do not knowingly collect personal information from
									children. If you believe we have inadvertently collected
									information from a child, please contact us immediately.
								</p>
							</section>

							{/* Changes to This Privacy Policy */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Changes to This Privacy Policy
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									We may update this Privacy Policy from time to time to reflect
									changes in our practices or legal requirements. We will notify
									you of any material changes by posting the updated policy on
									our website with a new "Last Updated" date. Your continued use
									of our services after changes are posted constitutes
									acceptance of the revised policy.
								</p>
							</section>

							{/* International Data Transfers */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									International Data Transfers
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									Your information may be transferred to and processed in
									countries other than your country of residence. These
									countries may have different data protection laws. By using
									our services, you consent to the transfer of your information
									as described in this Privacy Policy.
								</p>
							</section>

							{/* Contact Us */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Contact Us</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									If you have any questions, concerns, or requests regarding
									this Privacy Policy or our data practices, please contact us
									at:
								</p>
								<Button asChild>
									<Link to="/contact">Contact Us</Link>
								</Button>
								<p className="text-muted-foreground">
									<strong>Email:</strong> info@irishette.com
								</p>
								<p className="text-muted-foreground">
									<strong>Address:</strong> [Your Physical Address]
								</p>
							</section>

							{/* Acknowledgment */}
							<section className="mb-8 p-4 bg-muted/30 rounded-lg border border-primary/20">
								<p className="text-sm text-muted-foreground leading-relaxed">
									By using irishette.com, you acknowledge that you have read and
									understood this Privacy Policy and agree to its terms.
								</p>
							</section>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
