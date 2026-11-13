import { adminClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// No baseURL: the client uses the current origin (VITE_BETTER_AUTH_URL was never
// set, so this matches the previous behavior).
export const authClient = createAuthClient({
	plugins: [magicLinkClient(), adminClient()],
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

export const { signOut, changeEmail, changePassword } = authClient;
