import { stripeClient } from '@better-auth/stripe/client';
import {
	adminClient,
	magicLinkClient,
	phoneNumberClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BETTER_AUTH_URL,
	plugins: [
		magicLinkClient(),
		phoneNumberClient(),
		adminClient(),
		stripeClient(),
	],
	fetchOptions: {
		onRequest(context) {
			// Ensure cookies are included in SSR requests
			return {
				...context,
				credentials: 'include',
			};
		},
	},
});

export const {
	signIn,
	signOut,
	revokeSessions,
	useSession,
	signUp,
	$Infer,
	updateUser,
	requestPasswordReset,
	resetPassword,
	sendVerificationEmail,
	changeEmail,
} = authClient;
