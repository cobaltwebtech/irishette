import { Icon } from '@iconify/react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/auth/logout')({
	head: () => ({
		meta: [
			{
				title: 'Logout of Account | Irishette.com',
			},
		],
	}),
	component: LogoutPage,
});

function LogoutPage() {
	const [status, setStatus] = useState<'loading' | 'success'>('loading');
	const router = useRouter();

	useEffect(() => {
		const handleSignOut = async () => {
			try {
				await authClient.signOut();
				setStatus('success');

				// Redirect to home page after a brief delay
				setTimeout(() => {
					router.navigate({ to: '/' });
				}, 4000);
			} catch (error) {
				console.error('Sign out error:', error);
				// Even if there's an error, consider it successful for UX
				setStatus('success');
				setTimeout(() => {
					router.navigate({ to: '/' });
				}, 4000);
			}
		};

		handleSignOut();
	}, [router]);

	if (status === 'loading') {
		return (
			<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto size-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
							<Icon
								icon="tabler:loader-2"
								className="size-6 text-primary animate-spin"
							/>
						</div>
						<CardTitle>Signing You Out</CardTitle>
						<CardDescription>
							Please wait while we sign you out...
						</CardDescription>
					</CardHeader>
					<CardContent className="text-center">
						<p className="text-muted-foreground">
							This should only take a moment.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="flex items-center justify-center mx-auto size-16 bg-primary rounded-full mb-4">
						<Icon
							icon="tabler:door-exit"
							className="size-10 text-primary-foreground"
						/>
					</div>
					<CardTitle className="text-2xl font-bold">
						Successfully Signed Out
					</CardTitle>
				</CardHeader>
				<CardContent className="text-center">
					<p className="text-muted-foreground mb-6">
						You have been successfully signed out of your account.
					</p>
					<div className="flex flex-wrap gap-4">
						<Button asChild className="flex-1">
							<Link to="/">
								<Icon icon="tabler:home" className="size-5" />
								Go to Home
							</Link>
						</Button>
						<Button asChild variant="outline" className="flex-1">
							<Link to="/auth/login">
								<Icon icon="tabler:login-2" className="size-5" />
								Login Again
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
