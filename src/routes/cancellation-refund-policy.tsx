import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/cancellation-refund-policy')({
	head: () => ({
		meta: [
			{
				title: 'Cancellation & Refund Policy | Irishette.com',
			},
		],
	}),
	component: CancellationRefundPolicyPage,
});

function CancellationRefundPolicyPage() {
	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="text-4xl md:text-5xl font-bold mb-4">
						Cancellation and Refund Policy
					</h1>
					<p className="text-lg text-muted-foreground">
						Last Updated: October 16, 2025
					</p>
				</div>
			</section>

			{/* Policy Content */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl">
					<Card>
						<CardContent>
							{/* Overview */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Overview</h2>
								<p className="text-muted-foreground leading-relaxed">
									At irishette.com, we understand that plans can change. This
									Cancellation and Refund Policy outlines the terms and
									conditions for canceling your reservation and receiving
									refunds. Please review this policy carefully before making a
									booking.
								</p>
							</section>

							{/* Cancellation Timeframes */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Cancellation Timeframes and Penalties
								</h2>

								<div className="space-y-6">
									<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
										<h3 className="text-xl font-semibold mb-2">
											Cancellation More Than 72 Hours Before Check-In
										</h3>
										<ul className="space-y-1 text-muted-foreground">
											<li>
												<strong>Penalty:</strong> None
											</li>
											<li>
												<strong>Refund:</strong> 100% of the booking amount
											</li>
										</ul>
									</div>

									<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
										<h3 className="text-xl font-semibold mb-2">
											Cancellation Between 72-24 Hours Before Check-In
										</h3>
										<ul className="space-y-1 text-muted-foreground">
											<li>
												<strong>Penalty:</strong> 50% of the booking amount
											</li>
											<li>
												<strong>Refund:</strong> 50% of the booking amount
											</li>
										</ul>
									</div>

									<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
										<h3 className="text-xl font-semibold mb-2">
											Cancellation Within 24 Hours of Check-In
										</h3>
										<ul className="space-y-1 text-muted-foreground">
											<li>
												<strong>Penalty:</strong> 100% of the booking amount
											</li>
											<li>
												<strong>Refund:</strong> No refund will be issued
											</li>
										</ul>
									</div>
								</div>
							</section>

							{/* How to Cancel */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									How to Cancel Your Reservation
								</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									Cancellations must be made through one of the following
									methods:
								</p>
								<ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
									<li>
										<strong>Online:</strong> Visit our{' '}
										<Link to="/account" className="text-accent underline">
											Manage Bookings page
										</Link>{' '}
										and follow the cancellation instructions
									</li>
									<li>
										<strong>Telephone:</strong> Call us at{' '}
										<strong>(123) 456-7890</strong>
									</li>
								</ol>
								<p className="text-muted-foreground leading-relaxed mt-3">
									Cancellations are effective based on the date and time we
									receive your cancellation request, not when you decide to
									cancel. We recommend canceling as early as possible to avoid
									penalties.
								</p>
							</section>

							{/* Refund Processing */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Refund Processing</h2>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Processing Method
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									All refunds will be processed to the original payment method
									used at the time of booking. We do not issue refunds via cash
									or check under any circumstances.
								</p>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Processing Time
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Once your cancellation is confirmed and a refund is approved,
									please allow <strong>3-5 business days</strong> for the refund
									to appear on your card account. The exact timing may vary
									depending on your financial institution's processing schedule.
								</p>
							</section>

							{/* No-Show Policy */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">No-Show Policy</h2>
								<p className="text-muted-foreground leading-relaxed">
									Failure to arrive on your scheduled check-in date without
									prior cancellation will be treated as a cancellation within 24
									hours of check-in, resulting in forfeiture of your entire
									booking amount with no refund issued.
								</p>
							</section>

							{/* Early Departure */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Early Departure</h2>
								<p className="text-muted-foreground leading-relaxed">
									If you check out or leave the property before your scheduled
									checkout date, no refund will be given for the remaining days
									left on your booking. The full booking amount remains due
									regardless of early departure.
								</p>
							</section>

							{/* Deposits and Payment */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Deposits and Payment
								</h2>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Deposit Application
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									If a deposit was collected at the time of booking, that amount
									will be applied to your booking total as a credit. Any
									remaining balance will be due at checkout.
								</p>

								<h3 className="text-xl font-semibold mb-3 mt-6">
									Deposit Refunds
								</h3>
								<p className="text-muted-foreground leading-relaxed">
									Deposits are subject to the same cancellation timeframes and
									penalties outlined above. If you cancel your reservation, the
									deposit will be refunded according to the applicable penalty
									tier.
								</p>
							</section>

							{/* Violations and Property Damage */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Violations and Property Damage
								</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									If you violate our{' '}
									<Link
										to="/terms-of-service"
										className="text-accent underline"
									>
										Terms of Service
									</Link>{' '}
									or cause damage to the property and are required to vacate the
									premises before your scheduled checkout date,{' '}
									<strong>no refund will be issued</strong> for any portion of
									your stay.
								</p>
								<p className="text-muted-foreground leading-relaxed mb-3">
									This includes but is not limited to:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Violations of property rules and regulations</li>
									<li>Disruptive or illegal behavior</li>
									<li>Damage to property or furnishings</li>
									<li>Unauthorized guests or occupancy violations</li>
									<li>Smoking in non-smoking areas</li>
									<li>Any other breach of our Terms of Service</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									You will remain responsible for the full booking amount plus
									any additional charges for damages or cleaning fees.
								</p>
							</section>

							{/* Force Majeure */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Force Majeure and Cancellations by irishette.com
								</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									We reserve the right to cancel any reservation due to
									circumstances beyond our control, including but not limited
									to:
								</p>
								<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
									<li>Natural disasters</li>
									<li>Severe weather conditions</li>
									<li>Property damage or maintenance emergencies</li>
									<li>Government orders or restrictions</li>
									<li>Other unforeseen events</li>
								</ul>
								<p className="text-muted-foreground leading-relaxed mt-3">
									In the event we cancel your reservation, you will receive a{' '}
									<strong>full refund</strong> of all amounts paid, regardless
									of the timing of the cancellation.
								</p>
							</section>

							{/* Modifications */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Modifications to Reservations
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									Changes to your reservation dates or guest information may be
									possible subject to availability. Please contact us as early
									as possible to discuss modifications. Depending on the nature
									of the change, standard cancellation penalties may apply.
								</p>
							</section>

							{/* Special Circumstances */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">
									Special Circumstances
								</h2>
								<p className="text-muted-foreground leading-relaxed">
									We understand that extraordinary circumstances may arise. If
									you need to cancel due to a medical emergency, family
									emergency, or other exceptional situation, please contact us
									directly. While we cannot guarantee exceptions to this policy,
									we will review requests on a case-by-case basis.
								</p>
							</section>

							{/* Policy Changes */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Policy Changes</h2>
								<p className="text-muted-foreground leading-relaxed">
									We reserve the right to modify this Cancellation and Refund
									Policy at any time. Changes will be effective immediately upon
									posting with an updated "Last Updated" date. Your reservation
									will be subject to the policy in effect at the time of
									booking.
								</p>
							</section>

							{/* Contact Us */}
							<section className="mb-8">
								<h2 className="text-2xl font-bold mb-4">Contact Us</h2>
								<p className="text-muted-foreground leading-relaxed mb-3">
									If you have questions about this Cancellation and Refund
									Policy or need assistance with a cancellation, please contact
									us:
								</p>
								<div className="space-y-2">
									<p className="text-muted-foreground">
										<strong>Phone:</strong> (123) 456-7890
									</p>
									<p className="text-muted-foreground">
										<strong>Email:</strong> info@irishette.com
									</p>
									<Button asChild className="mt-4">
										<Link to="/account">Manage Bookings</Link>
									</Button>
								</div>
							</section>

							{/* Acknowledgment */}
							<section className="mb-8 p-4 bg-muted/30 rounded-lg border border-primary/20">
								<p className="text-sm text-muted-foreground leading-relaxed">
									By making a booking with irishette.com, you acknowledge that
									you have read, understood, and agree to this Cancellation and
									Refund Policy.
								</p>
							</section>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
