import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTRPC } from '@/integrations/trpc/react';
import { describeTiers } from '@/lib/booking/cancellation-policy';
import { CHECK_IN_TIME_LABEL } from '@/lib/site';
import { cn } from '@/utils/twMerge';

export const Route = createFileRoute('/cancellation-refund-policy')({
	head: () => ({
		meta: [
			{
				title: 'Cancellation & Refund Policy | Irishette.com',
			},
		],
	}),
	// The refund windows come from the active policy (the admin dashboard), so
	// this page always matches what a cancellation actually refunds.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.policies.getCancellationPolicy.queryOptions(),
		),
	component: CancellationRefundPolicyPage,
});

function tierStyle(refundPercent: number) {
	if (refundPercent >= 100) return 'border-green-200 bg-green-50';
	return refundPercent > 0
		? 'border-yellow-200 bg-yellow-50'
		: 'border-red-200 bg-red-50';
}

/** The active policy's refund windows, most notice first. */
function RefundTiers() {
	const trpc = useTRPC();
	const { data: policy } = useSuspenseQuery(
		trpc.policies.getCancellationPolicy.queryOptions(),
	);
	return (
		<div className="space-y-6">
			{describeTiers(policy.tiers).map((tier) => (
				<div
					key={tier.label}
					className={cn('rounded-lg border p-4', tierStyle(tier.refundPercent))}
				>
					<h3 className="mb-2 text-xl font-semibold">
						Cancellation: {tier.label}
					</h3>
					<ul className="space-y-1 text-muted-foreground">
						<li>
							<strong>Penalty:</strong>{' '}
							{tier.refundPercent >= 100
								? 'None'
								: `${100 - tier.refundPercent}% of the booking amount`}
						</li>
						<li>
							<strong>Refund:</strong>{' '}
							{tier.refundPercent === 0
								? 'No refund will be issued'
								: `${tier.refundPercent}% of the booking amount`}
						</li>
					</ul>
				</div>
			))}
		</div>
	);
}

function CancellationRefundPolicyPage() {
	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="my-8">
				<div className="container mx-auto max-w-4xl text-center">
					<h1 className="mb-4 text-4xl font-bold md:text-5xl">
						Cancellation and Refund Policy
					</h1>
					<p className="text-lg text-muted-foreground">
						Last Updated: November 13, 2026
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
								<h2 className="mb-4 text-2xl font-bold">Overview</h2>
								<p className="leading-relaxed text-muted-foreground">
									At irishette.com, we understand that plans can change. This
									Cancellation and Refund Policy outlines the terms and
									conditions for canceling your reservation and receiving
									refunds. Please review this policy carefully before making a
									booking.
								</p>
							</section>

							{/* Cancellation Timeframes */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									Cancellation Timeframes and Penalties
								</h2>

								<RefundTiers />
								<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
									Refund windows are counted back from check-in at{' '}
									{CHECK_IN_TIME_LABEL} on your arrival date. The booking amount
									is the total you paid, including taxes and fees. Online
									cancellation closes at check-in.
								</p>
							</section>

							{/* How to Cancel */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									How to Cancel Your Reservation
								</h2>
								<p className="mb-3 leading-relaxed text-muted-foreground">
									Cancellations must be made through one of the following
									methods:
								</p>
								<ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
									<li>
										<strong>Online:</strong> Visit our{' '}
										<Link to="/account" className="text-accent underline">
											View Your Bookings page
										</Link>{' '}
										and follow the cancellation instructions
									</li>
									<li>
										<strong>Telephone:</strong> Call us at{' '}
										<strong>254-454-5558</strong>
									</li>
								</ol>
								<p className="mt-3 leading-relaxed text-muted-foreground">
									Cancellations are effective based on the date and time we
									receive your cancellation request, not when you decide to
									cancel. We recommend canceling as early as possible to avoid
									penalties.
								</p>
							</section>

							{/* Refund Processing */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">Refund Processing</h2>

								<h3 className="mt-6 mb-3 text-xl font-semibold">
									Processing Method
								</h3>
								<p className="leading-relaxed text-muted-foreground">
									All refunds will be processed to the original payment method
									used at the time of booking. We do not issue refunds via cash
									or check under any circumstances.
								</p>

								<h3 className="mt-6 mb-3 text-xl font-semibold">
									Processing Time
								</h3>
								<p className="leading-relaxed text-muted-foreground">
									Once your cancellation is confirmed and a refund is approved,
									please allow <strong>5-10 business days</strong> for the
									refund to appear on your card account. The exact timing may
									vary depending on your financial institution's processing
									schedule.
								</p>
							</section>

							{/* No-Show Policy */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">No-Show Policy</h2>
								<p className="leading-relaxed text-muted-foreground">
									Failure to arrive on your scheduled check-in date without
									prior cancellation will be treated as a cancellation after
									check-in ({CHECK_IN_TIME_LABEL}), resulting in forfeiture of
									your entire booking amount with no refund issued.
								</p>
								<p className="mt-3 leading-relaxed text-muted-foreground">
									You are welcome to arrive earlier than {CHECK_IN_TIME_LABEL}.
									The estimated arrival time you choose when booking only helps
									us plan to meet you; it does not change your check-in time,
									the cancellation windows or any refund.
								</p>
							</section>

							{/* Early Departure */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">Early Departure</h2>
								<p className="leading-relaxed text-muted-foreground">
									If you check out or leave the property before your scheduled
									checkout date, no refund will be given for the remaining days
									left on your booking. The full booking amount remains due
									regardless of early departure.
								</p>
							</section>

							{/* Payment */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">Payment</h2>
								<p className="leading-relaxed text-muted-foreground">
									The full booking amount, including taxes and fees, is due
									upfront when you book. We do not take deposits, and no balance
									is collected at check-in or checkout. Any refund is a
									percentage of the total you paid, according to the
									cancellation windows above.
								</p>
							</section>

							{/* Violations and Property Damage */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									Violations and Property Damage
								</h2>
								<p className="mb-3 leading-relaxed text-muted-foreground">
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
								<p className="mb-3 leading-relaxed text-muted-foreground">
									This includes but is not limited to:
								</p>
								<ul className="list-disc space-y-2 pl-6 text-muted-foreground">
									<li>Violations of property rules and regulations</li>
									<li>Disruptive or illegal behavior</li>
									<li>Damage to property or furnishings</li>
									<li>Unauthorized guests or occupancy violations</li>
									<li>Smoking anywhere on the property</li>
									<li>Bringing pets onto the property</li>
									<li>Any other breach of our Terms of Service</li>
								</ul>
								<p className="mt-3 leading-relaxed text-muted-foreground">
									You will remain responsible for the full booking amount plus
									any additional charges for damages or cleaning fees.
								</p>
							</section>

							{/* Force Majeure */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									Force Majeure and Cancellations by irishette.com
								</h2>
								<p className="mb-3 leading-relaxed text-muted-foreground">
									We reserve the right to cancel any reservation due to
									circumstances beyond our control, including but not limited
									to:
								</p>
								<ul className="list-disc space-y-2 pl-6 text-muted-foreground">
									<li>Natural disasters</li>
									<li>Severe weather conditions</li>
									<li>Property damage or maintenance emergencies</li>
									<li>Government orders or restrictions</li>
									<li>Other unforeseen events</li>
								</ul>
								<p className="mt-3 leading-relaxed text-muted-foreground">
									In the event we cancel your reservation, you will receive a{' '}
									<strong>full refund</strong> of all amounts paid, regardless
									of the timing of the cancellation.
								</p>
							</section>

							{/* Modifications */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									Modifications to Reservations
								</h2>
								<p className="leading-relaxed text-muted-foreground">
									Changes to your reservation dates or guest information may be
									possible subject to availability. Please contact us as early
									as possible to discuss modifications. Depending on the nature
									of the change, standard cancellation penalties may apply.
								</p>
							</section>

							{/* Special Circumstances */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">
									Special Circumstances
								</h2>
								<p className="leading-relaxed text-muted-foreground">
									We understand that extraordinary circumstances may arise. If
									you need to cancel due to a medical emergency, family
									emergency, or other exceptional situation, please contact us
									directly. While we cannot guarantee exceptions to this policy,
									we will review requests on a case-by-case basis.
								</p>
							</section>

							{/* Policy Changes */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">Policy Changes</h2>
								<p className="leading-relaxed text-muted-foreground">
									We reserve the right to modify this Cancellation and Refund
									Policy at any time. Changes will be effective immediately upon
									posting with an updated "Last Updated" date. Your reservation
									will be subject to the policy in effect at the time of
									booking.
								</p>
							</section>

							{/* Contact Us */}
							<section className="mb-8">
								<h2 className="mb-4 text-2xl font-bold">Contact Us</h2>
								<p className="mb-3 leading-relaxed text-muted-foreground">
									If you have questions about this Cancellation and Refund
									Policy or need assistance with a cancellation, please contact
									us:
								</p>
								<div className="space-y-2">
									<p className="text-muted-foreground">
										<strong>Phone:</strong> 254-454-5558
									</p>
									<p className="text-muted-foreground">
										<strong>Email:</strong> info@irishette.com
									</p>
									<Link
										to="/account"
										data-slot="button"
										className={cn(buttonVariants(), 'mt-4')}
									>
										View Your Bookings
									</Link>
								</div>
							</section>

							{/* Acknowledgment */}
							<section className="mb-8 rounded-lg border border-primary/20 bg-muted/30 p-4">
								<p className="text-sm leading-relaxed text-muted-foreground">
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
