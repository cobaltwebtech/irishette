import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { client } from '@/lib/auth-client';

export const Route = createFileRoute('/logout')({
	component: LogoutPage,
});

function LogoutPage() {
	const [status, setStatus] = useState<'loading' | 'success'>('loading');
	const router = useRouter();

	useEffect(() => {
		const handleSignOut = async () => {
			try {
				await client.signOut();
				setStatus('success');

				// Redirect to home page after a brief delay
				setTimeout(() => {
					router.navigate({ to: '/' });
				}, 2000);
			} catch (error) {
				console.error('Sign out error:', error);
				// Even if there's an error, consider it successful for UX
				setStatus('success');
				setTimeout(() => {
					router.navigate({ to: '/' });
				}, 2000);
			}
		};

		handleSignOut();
	}, [router]);

	if (status === 'loading') {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
							<Loader2 className="w-6 h-6 text-primary animate-spin" />
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
		<div className="min-h-screen bg-background flex items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
						<CheckCircle2 className="w-6 h-6 text-green-600" />
					</div>
					<CardTitle>Successfully Signed Out</CardTitle>
					<CardDescription>Thank you for visiting Irishette!</CardDescription>
				</CardHeader>
				<CardContent className="text-center">
					<p className="text-muted-foreground mb-6">
						You have been successfully signed out of your account.
					</p>
					<div className="space-y-2">
						<Link
							to="/"
							className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors w-full"
						>
							Return to Home
						</Link>
						<Link
							to="/login"
							className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors w-full"
						>
							Sign In Again
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
