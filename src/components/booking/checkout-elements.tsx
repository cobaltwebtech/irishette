import { Icon } from '@iconify/react';
import type { StripeUseCheckoutElementsResult } from '@stripe/react-stripe-js/checkout';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { isTRPCClientError } from '@trpc/client';

// Shared by the guest PaymentStep and the admin booking pages (plan 06):
// Stripe.js loading, the Checkout Session summary and the Payment Element
// styling.

let stripePromise: Promise<Stripe | null> | undefined;

/** Stripe.js, loaded once per page (publishable key from the server). */
export const getStripe = (publishableKey: string) => {
	stripePromise ??= loadStripe(publishableKey);
	return stripePromise;
};

/** A short message for a failed tRPC call, never the whole error object. */
export const errorMessage = (error: unknown, fallback: string) =>
	isTRPCClientError(error) ? error.message : fallback;

/** Payment Element look (site colours and font). */
export const CHECKOUT_ELEMENTS_OPTIONS = {
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

type LoadedCheckout = Extract<
	StripeUseCheckoutElementsResult,
	{ checkout: unknown }
>['checkout'];

/**
 * Confirms the Checkout Session, redirecting only when the payment method
 * needs it. Returns the session id, or the message to show.
 */
export async function confirmCheckoutSession(
	checkout: LoadedCheckout,
): Promise<{ sessionId: string } | { error: string }> {
	try {
		const result = await checkout.confirm({ redirect: 'if_required' });
		return result.type === 'error'
			? { error: result.error.message }
			: { sessionId: result.session.id };
	} catch {
		return { error: 'Payment failed. Please try again.' };
	}
}

/** While the Checkout Session loads, or why it could not. */
export function CheckoutPending({ error }: { error?: string }) {
	if (error) return <p className="text-sm text-destructive">{error}</p>;
	return (
		<div className="flex justify-center py-8">
			<Icon icon="tabler:loader-2" className="size-8 animate-spin" />
		</div>
	);
}

/** Line items and total from the Checkout Session (what Stripe will charge). */
export function CheckoutSummary({
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
					The payment total does not match the booking. Please go back and try
					again.
				</p>
			)}
		</div>
	);
}
