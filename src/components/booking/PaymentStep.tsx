import { Icon } from '@iconify/react';
import {
	CheckoutElementsProvider,
	PaymentElement,
	useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import { useLenis } from 'lenis/react';
import { useEffect, useId, useState } from 'react';

import { CancellationPolicySummary } from '@/components/booking/CancellationPolicySummary';
import {
	CHECKOUT_ELEMENTS_OPTIONS,
	CheckoutPending,
	CheckoutSummary,
	confirmCheckoutSession,
	errorMessage,
	getStripe,
} from '@/components/booking/checkout-elements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import { useBookingStore } from '@/stores';

// Payment with a Stripe Checkout Session (ui_mode 'elements'): the server
// creates one session per hold (bookings.createCheckoutSession) and the
// Payment Element confirms it with checkout.confirm(). Redirect-based payment
// methods come back to the confirmation page with ?session_id=..., which
// runs the same confirmation (bookings.confirmCheckout); the webhook is the
// source of truth either way.

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

	if (checkoutState.type === 'loading') return <CheckoutPending />;
	if (checkoutState.type === 'error') {
		return <CheckoutPending error={checkoutState.error.message} />;
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

		const result = await confirmCheckoutSession(checkout);
		setIsProcessing(false);
		if ('error' in result) {
			setErrorText(result.error);
			toast.add({ type: 'error', title: result.error });
			return;
		}
		// Paid: the confirmation page runs the confirmation and shows the
		// booking's real status.
		void navigate({
			to: '/booking/confirmation/$publicId',
			params: { publicId },
			search: { session_id: result.sessionId },
		});
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
					<p className="text-balance">
						I authorize Irishette to keep this card on file and to charge or
						refund it for the difference when I ask to change this reservation
						by phone and approve the new price.
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
						toast.add({
							type: 'success',
							title:
								'Your booking session has been refreshed. Room is still available!',
							timeout: 4000,
						});
					}
				} catch (refreshError) {
					// If refresh fails (room no longer available), show error and go back
					toast.add({
						type: 'error',
						title: errorMessage(
							refreshError,
							'Unable to proceed with this booking',
						),
						timeout: 6000,
					});
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
				toast.add({
					type: 'error',
					title:
						isTRPCClientError(error) && error.data?.code === 'CONFLICT'
							? error.message
							: 'Failed to initialize payment',
					timeout: 6000,
				});
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
					options={{
						clientSecret: checkoutInfo.clientSecret,
						elementsOptions: CHECKOUT_ELEMENTS_OPTIONS,
					}}
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
