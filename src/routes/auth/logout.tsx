import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { authClient } from '@/lib/auth/auth-client';
import { clearSession } from '@/lib/auth/session';

export const Route = createFileRoute('/auth/logout')({
	head: () => ({
		meta: [
			{
				title: 'Logout | Irishette.com',
			},
		],
	}),
	// Sign-out is a side effect, so it runs in the browser after mount, not in
	// beforeLoad (which also runs during SSR and on link preload).
	component: LogoutPage,
});

function LogoutPage() {
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				await authClient.signOut();
			} catch (error) {
				console.error('Sign out error:', error);
			}
			if (cancelled) return;
			await clearSession(queryClient, router);
			await router.navigate({ to: '/', replace: true });
		})();
		return () => {
			cancelled = true;
		};
	}, [queryClient, router]);

	return (
		<main className="flex flex-1 items-center justify-center p-8">
			<p className="text-muted-foreground">Signing out…</p>
		</main>
	);
}
