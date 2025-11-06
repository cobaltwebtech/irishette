import { createFileRoute, redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/auth/logout')({
	head: () => ({
		meta: [
			{
				title: 'Logout | Irishette.com',
			},
		],
	}),
	beforeLoad: async () => {
		// Sign out before component mounts
		try {
			await authClient.signOut();
		} catch (error) {
			// Log error but still redirect
			console.error('Sign out error:', error);
		}

		// Redirect immediately to home page
		throw redirect({
			to: '/',
			replace: true,
		});
	},
	// Component never renders because beforeLoad redirects
	component: () => null,
});
