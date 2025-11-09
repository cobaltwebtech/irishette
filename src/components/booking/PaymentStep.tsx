import { Icon } from '@iconify/react';
import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useMutation } from '@tanstack/react-query';
import { useLenis } from 'lenis/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useBookingStore } from '@/stores';

// Initialize Stripe outside component to avoid recreating
let stripePromise: Promise<Stripe | null>;
const getStripe = (publishableKey: string) => {
	if (!stripePromise) {
		stripePromise = loadStripe(publishableKey);
	}
	return stripePromise;
};

// Inner payment form component that has access to Stripe context
function PaymentForm() {
	const stripe = useStripe();
	const elements = useElements();
	const booking = useBookingStore();
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const confirmPaymentMutation = useMutation({
		mutationFn: async (paymentIntentId: string) => {
			if (!booking.bookingId) {
				throw new Error('No booking ID found');
			}
			return await trpcClient.bookings.confirmPayment.mutate({
				bookingId: booking.bookingId,
				paymentIntentId,
			});
		},
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!stripe || !elements) {
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			// Confirm the payment with Stripe
			const { error, paymentIntent } = await stripe.confirmPayment({
				elements,
				redirect: 'if_required',
			});

			if (error) {
				setErrorMessage(error.message || 'Payment failed');
				toast.error(error.message || 'Payment failed');
			} else if (paymentIntent && paymentIntent.status === 'succeeded') {
				// Payment succeeded, confirm with backend
				await confirmPaymentMutation.mutateAsync(paymentIntent.id);

				// Move to confirmation step
				booking.actions.setStep('confirmation');
				toast.success('Payment successful!');
			}
		} catch (error) {
			console.error('Payment error:', error);
			const errorMsg =
				error instanceof Error ? error.message : 'Payment failed';
			setErrorMessage(errorMsg);
			toast.error('Payment processing failed');
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<PaymentElement />

			{errorMessage && (
				<div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
					<div className="flex items-start gap-2">
						<Icon
							icon="tabler:alert-circle"
							className="size-5 shrink-0 mt-0.5"
						/>
						<p className="text-sm">{errorMessage}</p>
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
					<Icon icon="tabler:arrow-left" className="size-5" />
					Back
				</Button>

				<Button
					type="submit"
					disabled={!stripe || isProcessing}
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
							Pay ${booking.pricing?.totalAmount.toFixed(2)}
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
	const lenis = useLenis();
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [stripePublishableKey, setStripePublishableKey] = useState<
		string | null
	>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Scroll to top when payment step mounts
	useEffect(() => {
		if (lenis) {
			lenis.scrollTo(0, { immediate: false, duration: 0.8 });
		}
	}, [lenis]);

	// Create payment intent when component mounts
	useEffect(() => {
		const initializePayment = async () => {
			try {
				if (!booking.bookingId) {
					throw new Error('No booking ID found');
				}

				const result = await trpcClient.bookings.createPaymentIntent.mutate({
					bookingId: booking.bookingId,
				});

				setClientSecret(result.clientSecret);
				setStripePublishableKey(result.publishableKey);
			} catch (error) {
				console.error('Failed to initialize payment:', error);
				toast.error('Failed to initialize payment');
				booking.actions.setStep('details');
			} finally {
				setIsLoading(false);
			}
		};

		initializePayment();
	}, [booking.bookingId, booking.actions]);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="py-12">
					<div className="text-center space-y-4">
						<Icon
							icon="tabler:loader-2"
							className="size-8 animate-spin mx-auto text-primary"
						/>
						<p className="text-muted-foreground">Preparing payment...</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!clientSecret || !stripePublishableKey) {
		return (
			<Card>
				<CardContent className="py-12">
					<div className="text-center space-y-4">
						<Icon
							icon="tabler:alert-circle"
							className="size-8 text-destructive mx-auto"
						/>
						<p className="text-destructive font-semibold">
							Failed to initialize payment
						</p>
						<p className="text-sm text-muted-foreground">
							There was an error preparing your payment. Please try again.
						</p>
						<Button
							onClick={() => booking.actions.setStep('details')}
							variant="outline"
						>
							<Icon icon="tabler:arrow-left" className="size-4" />
							Go Back
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	const options = {
		clientSecret,
		appearance: {
			theme: 'stripe' as const,
			variables: {
				colorPrimary: '#0ea5e9',
				colorBackground: '#ffffff',
				colorText: '#1e293b',
				colorDanger: '#ef4444',
				fontFamily: 'system-ui, sans-serif',
				spacingUnit: '4px',
				borderRadius: '8px',
			},
		},
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
				{/* Total Amount Display */}
				<div className="p-4 bg-muted rounded-lg border">
					<div className="flex justify-between items-center">
						<span className="font-semibold text-lg">Total Amount:</span>
						<span className="text-2xl font-bold">
							${booking.pricing?.totalAmount.toFixed(2)}
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-1">
						{booking.pricing?.nights} night
						{booking.pricing?.nights !== 1 ? 's' : ''}
					</p>
				</div>

				{/* Stripe Elements Form */}
				<Elements stripe={getStripe(stripePublishableKey)} options={options}>
					<PaymentForm />
				</Elements>

				{/* Security Badge */}
				<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4 border-t">
					<Icon icon="tabler:lock" className="size-4" />
					<span>Secure payment powered by Stripe</span>
				</div>
			</CardContent>
		</Card>
	);
}
