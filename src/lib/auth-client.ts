import { stripeClient } from '@better-auth/stripe/client';
import { adminClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const client = createAuthClient({
	baseURL: import.meta.env.BETTER_AUTH_URL,
	plugins: [magicLinkClient(), adminClient(), stripeClient()],
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
	changePassword,
	resetPassword,
	forgetPassword,
	sendVerificationEmail,
	changeEmail,
} = client;
