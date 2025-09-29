import { stripeClient } from '@better-auth/stripe/client';
import { adminClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BETTER_AUTH_URL,
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
console.log('Auth Client Base URL:', import.meta.env.VITE_BETTER_AUTH_URL);
console.log(
	'All VITE env vars:',
	Object.keys(import.meta.env).filter((k) => k.startsWith('VITE_')),
);

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
} = authClient;
