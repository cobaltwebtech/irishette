import { Icon } from '@iconify/react';
import {
	CheckoutElementsProvider,
	PaymentElement,
	useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { useState } from 'react';

import {
	CHECKOUT_ELEMENTS_OPTIONS,
	CheckoutPending,
	CheckoutSummary,
	confirmCheckoutSession,
	getStripe,
} from '@/components/booking/checkout-elements';
import { Button } from '@/components/ui/button';

// The card the guest reads out by phone, typed by an admin (plan 06): a
// card-only Checkout Session (the server allows only 'card' for admin
// sessions) with Apple Pay and Google Pay hidden. Not a Stripe MOTO flow:
// confirm with Stripe support before relying on it in live mode.

export interface AdminCheckout {
	clientSecret: string;
	publishableKey: string;
}

interface AdminCardPaymentProps extends AdminCheckout {
	/** The amount the admin approved, in cents (checked against the session). */
	expectedCents: number;
	/** The card was authorized: confirm the session server-side. */
	onAuthorized: (sessionId: string) => Promise<void> | void;
	onCancel?: () => void;
}

export function AdminCardPayment({
	clientSecret,
	publishableKey,
	...form
}: AdminCardPaymentProps) {
	return (
		<CheckoutElementsProvider
			stripe={getStripe(publishableKey)}
			options={{ clientSecret, elementsOptions: CHECKOUT_ELEMENTS_OPTIONS }}
		>
			<AdminCardForm {...form} />
		</CheckoutElementsProvider>
	);
}

function AdminCardForm({
	expectedCents,
	onAuthorized,
	onCancel,
}: Omit<AdminCardPaymentProps, keyof AdminCheckout>) {
	const checkoutState = useCheckoutElements();
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorText, setErrorText] = useState<string | null>(null);

	if (checkoutState.type === 'loading') return <CheckoutPending />;
	if (checkoutState.type === 'error') {
		return <CheckoutPending error={checkoutState.error.message} />;
	}
	const { checkout } = checkoutState;
	const totalMatches = checkout.total.total.minorUnitsAmount === expectedCents;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsProcessing(true);
		setErrorText(null);
		const result = await confirmCheckoutSession(checkout);
		try {
			if ('error' in result) setErrorText(result.error);
			else await onAuthorized(result.sessionId);
		} catch {
			setErrorText(
				'The card was authorized, but the booking could not be confirmed. Check the booking before trying again.',
			);
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
			<PaymentElement
				options={{ wallets: { applePay: 'never', googlePay: 'never' } }}
			/>
			{errorText && (
				<p className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{errorText}
				</p>
			)}
			<div className="flex gap-3">
				{onCancel && (
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isProcessing}
						className="flex-1"
					>
						Back
					</Button>
				)}
				<Button
					type="submit"
					disabled={!checkout.canConfirm || !totalMatches || isProcessing}
					className="flex-1"
				>
					{isProcessing ? (
						<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
					) : (
						<Icon icon="tabler:credit-card-pay" className="size-5" />
					)}
					Charge {checkout.total.total.amount}
				</Button>
			</div>
		</form>
	);
}
