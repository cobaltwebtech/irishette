import { createFileRoute } from '@tanstack/react-router';
import { handleStripeWebhook } from '@/lib/stripe-webhook';

// Server route for the Stripe webhook (handler in src/lib/stripe-webhook.ts).
export const Route = createFileRoute('/api/stripe/$')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const url = new URL(request.url);
				if (url.pathname.endsWith('/webhook')) {
					return handleStripeWebhook(request);
				}
				return new Response('Not Found', { status: 404 });
			},
		},
	},
});
