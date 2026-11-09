import { Icon } from '@iconify/react';
import {
	CheckoutElementsProvider,
	PaymentElement,
	useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import { useLenis } from 'lenis/react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { CancellationPolicySummary } from '@/components/booking/CancellationPolicySummary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/integrations/trpc/react';
import { useBookingStore } from '@/stores';

// Payment with a Stripe Checkout Session (ui_mode 'elements'): the server
// creates one session per hold (bookings.createCheckoutSession) and the
// Payment Element confirms it with checkout.confirm(). Redirect-based payment
// methods come back to the confirmation page with ?session_id=..., which
// runs the same confirmation (bookings.confirmCheckout); the webhook is the
// source of truth either way.

// Initialize Stripe outside component to avoid recreating
let stripePromise: Promise<Stripe | null>;
const getStripe = (publishableKey: string) => {
	if (!stripePromise) {
		stripePromise = loadStripe(publishableKey);
	}
	return stripePromise;
};

/** A short message for a failed tRPC call, never the whole error object. */
const errorMessage = (error: unknown, fallback: string) =>
	isTRPCClientError(error) ? error.message : fallback;

/** Line items and total from the Checkout Session (what Stripe will charge). */
function CheckoutSummary({
	lineItems,
	total,
	matches,
}: {
	lineItems: Array<{ id: string; name: string; total: { amount: string } }>;
	total: string;
	matches: boolean;
}) {
	return (
		<div className="space-y-2 rounded-lg border bg-muted p-4 text-sm">
			{lineItems.map((item) => (
				<div key={item.id} className="flex justify-between gap-4">
					<span>{item.name}</span>
					<span>{item.total.amount}</span>
				</div>
			))}
			<div className="flex justify-between gap-4 border-t pt-2 text-lg font-semibold">
				<span>Total</span>
				<span>{total}</span>
			</div>
			{!matches && (
				<p className="text-destructive">
					The payment total does not match your booking. Please go back and try
					again.
				</p>
			)}
		</div>
	);
}

// Inner payment form component that has access to the Checkout context
function PaymentForm({ publicId }: { publicId: string }) {
	const checkoutState = useCheckoutElements();
	const booking = useBookingStore();
	const navigate = useNavigate();
	const policiesId = useId();
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorText, setErrorText] = useState<string | null>(null);
	const [acceptedPolicies, setAcceptedPolicies] = useState(false);
	const [policyError, setPolicyError] = useState<string | null>(null);

	if (checkoutState.type === 'loading') {
		return (
			<div className="flex justify-center py-8">
				<Icon icon="tabler:loader-2" className="size-8 animate-spin" />
			</div>
		);
	}
	if (checkoutState.type === 'error') {
		return (
			<p className="text-sm text-destructive">{checkoutState.error.message}</p>
		);
	}
	const { checkout } = checkoutState;
	const expectedCents = Math.round((booking.pricing?.totalAmount ?? 0) * 100);
	const totalMatches = checkout.total.total.minorUnitsAmount === expectedCents;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validate policy acceptance first
		if (!acceptedPolicies) {
			setPolicyError('You must accept the policies to continue');
			return;
		}
		setPolicyError(null);
		setIsProcessing(true);
		setErrorText(null);

		try {
			const result = await checkout.confirm({ redirect: 'if_required' });
			if (result.type === 'error') {
				setErrorText(result.error.message);
				toast.error(result.error.message);
				return;
			}
			// Paid (or a delayed payment started): the confirmation page runs
			// the confirmation and shows the booking's real status.
			void navigate({
				to: '/booking/confirmation/$publicId',
				params: { publicId },
				search: { session_id: result.session.id },
			});
		} catch {
			setErrorText('Payment failed. Please try again.');
			toast.error('Payment processing failed');
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<CheckoutSummary
				lineItems={checkout.lineItems}
				total={checkout.total.total.amount}
				matches={totalMatches}
			/>

			<PaymentElement />

			{/* Policy Acceptance Checkbox */}
			<div className="flex items-start gap-3">
				<Checkbox
					id={policiesId}
					className="size-6 cursor-pointer"
					checked={acceptedPolicies}
					onCheckedChange={(checked) => setAcceptedPolicies(checked === true)}
					aria-invalid={!!policyError}
				/>
				<div className="space-y-1 text-sm">
					<Label
						htmlFor={policiesId}
						className="flex cursor-pointer flex-wrap gap-2"
					>
						Policies Acknowledgement
					</Label>
					<p className="">
						Please check the box to acknowledge our policies and complete your
						payment.
					</p>
					<p className="text-balance">
						I have read and accept the{' '}
						<Link
							to="/cancellation-refund-policy"
							target="_blank"
							className="font-medium text-nowrap text-accent hover:underline"
						>
							Cancellation & Refund Policy
						</Link>
						,{' '}
						<Link
							to="/terms-of-service"
							target="_blank"
							className="font-medium text-nowrap text-accent hover:underline"
						>
							Terms of Service
						</Link>
						, and{' '}
						<Link
							to="/privacy-policy"
							target="_blank"
							className="font-medium text-nowrap text-accent hover:underline"
						>
							Privacy Policy
						</Link>
						.
					</p>
				</div>
				{policyError && (
					<p className="ml-7 text-sm text-destructive">{policyError}</p>
				)}
			</div>

			{errorText && (
				<div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-destructive">
					<div className="flex items-start gap-2">
						<Icon
							icon="tabler:alert-circle"
							className="mt-0.5 size-5 shrink-0"
						/>
						<p className="text-sm">{errorText}</p>
					</div>
				</div>
			)}

			<div className="flex gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => booking.actions.setStep('details')}
					disabled={isProcessing}
					className="flex-1"
				>
					← Back
				</Button>

				<Button
					type="submit"
					disabled={
						!checkout.canConfirm ||
						!totalMatches ||
						isProcessing ||
						!acceptedPolicies
					}
					className="flex-1"
				>
					{isProcessing ? (
						<>
							<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
							Processing...
						</>
					) : (
						<>
							<Icon icon="tabler:credit-card-pay" className="size-5" />
							Pay {checkout.total.total.amount}
						</>
					)}
				</Button>
			</div>
		</form>
	);
}

// Main payment step component
export function PaymentStep() {
	const booking = useBookingStore();
	const trpc = useTRPC();
	const lenis = useLenis();
	const navigate = useNavigate();
	// mutateAsync is stable across renders, so it is safe as an effect dependency
	const { mutateAsync: refreshBooking } = useMutation(
		trpc.bookings.refreshBooking.mutationOptions(),
	);
	const { mutateAsync: createCheckoutSession } = useMutation(
		trpc.bookings.createCheckoutSession.mutationOptions(),
	);
	const [checkoutInfo, setCheckoutInfo] = useState<{
		clientSecret: string;
		publishableKey: string;
		publicId: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	// The active policy's windows for these dates (cutoffs shown in CT).
	const { data: policy } = useQuery(
		trpc.policies.getCancellationPolicy.queryOptions(),
	);

	// Scroll to top when payment step mounts
	useEffect(() => {
		if (lenis) {
			lenis.scrollTo(0, { immediate: false, duration: 0.8 });
		}
	}, [lenis]);

	// Create (or reuse) the hold's Checkout Session when the step mounts
	useEffect(() => {
		const initializePayment = async () => {
			try {
				if (!booking.bookingId) {
					throw new Error('No booking ID found');
				}

				// First, refresh an expired hold if the dates are still free
				try {
					const refreshResult = await refreshBooking({
						bookingId: booking.bookingId,
					});
					if (refreshResult.refreshed) {
						toast.success(
							'Your booking session has been refreshed. Room is still available!',
							{ duration: 4000 },
						);
					}
				} catch (refreshError) {
					// If refresh fails (room no longer available), show error and go back
					toast.error(
						errorMessage(refreshError, 'Unable to proceed with this booking'),
						{ duration: 6000 },
					);
					booking.actions.setStep('details');
					setIsLoading(false);
					return;
				}

				const result = await createCheckoutSession({
					bookingId: booking.bookingId,
				});
				if (result.status === 'complete') {
					// Already paid (e.g. in another tab): show the booking.
					void navigate({
						to: '/booking/confirmation/$publicId',
						params: { publicId: result.publicId },
					});
					return;
				}
				setCheckoutInfo({
					clientSecret: result.clientSecret,
					publishableKey: result.publishableKey,
					publicId: result.publicId,
				});
			} catch (error) {
				toast.error(
					isTRPCClientError(error) && error.data?.code === 'CONFLICT'
						? error.message
						: 'Failed to initialize payment',
					{ duration: 6000 },
				);
				booking.actions.setStep('details');
			} finally {
				setIsLoading(false);
			}
		};

		void initializePayment();
	}, [
		booking.bookingId,
		booking.actions,
		refreshBooking,
		createCheckoutSession,
		navigate,
	]);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="py-12">
					<div className="space-y-4 text-center">
						<Icon
							icon="tabler:loader-2"
							className="mx-auto size-8 animate-spin text-primary"
						/>
						<p className="text-muted-foreground">Preparing payment...</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!checkoutInfo) {
		return (
			<Card>
				<CardContent className="py-12">
					<div className="space-y-4 text-center">
						<Icon
							icon="tabler:alert-circle"
							className="mx-auto size-8 text-destructive"
						/>
						<p className="font-semibold text-destructive">
							Failed to initialize payment
						</p>
						<p className="text-sm text-muted-foreground">
							There was an error preparing your payment. Please try again.
						</p>
						<Button
							onClick={() => booking.actions.setStep('details')}
							variant="outline"
						>
							← Go Back
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	const elementsOptions = {
		appearance: {
			theme: 'stripe' as const,
			labels: 'floating' as const,
			variables: {
				colorPrimary: '#072a00',
				colorBackground: '#dceacf',
				colorText: '#31632c',
				colorDanger: '#e85854',
				fontFamily: 'Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif',
				spacingUnit: '4px',
				borderRadius: '10px',
			},
			rules: {
				'.Input': {
					backgroundColor: '#ffffff',
				},
			},
		},
		fonts: [
			{
				cssSrc:
					'https://fonts.bunny.net/css?family=schibsted-grotesk:400,600,700',
			},
		],
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:credit-card" className="size-6" />
					Payment Information
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<p className="text-sm text-muted-foreground">
					{booking.pricing?.nights} night
					{booking.pricing?.nights !== 1 ? 's' : ''}
				</p>

				{policy && booking.checkInDate && (
					<div className="rounded-lg border p-4">
						<p className="mb-1 font-semibold">Cancellation policy</p>
						<CancellationPolicySummary
							tiers={policy.tiers}
							checkInDate={booking.checkInDate}
						/>
					</div>
				)}

				{/* Stripe Checkout Session + Payment Element */}
				<CheckoutElementsProvider
					stripe={getStripe(checkoutInfo.publishableKey)}
					options={{ clientSecret: checkoutInfo.clientSecret, elementsOptions }}
				>
					<PaymentForm publicId={checkoutInfo.publicId} />
				</CheckoutElementsProvider>

				{/* Security Badge */}
				<div className="flex items-center justify-center gap-2 border-t pt-4 text-sm text-muted-foreground">
					<Icon icon="tabler:lock" className="size-4" />
					<span>Secure payment powered by Stripe</span>
				</div>
			</CardContent>
		</Card>
	);
}
