import { createFileRoute, useRouter } from '@tanstack/react-router';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { client, useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/login')({
	head: () => ({
		meta: [
			{
				title: 'Login | Irishette.com',
			},
		],
	}),
	component: LoginPage,
});

function LoginPage() {
	const [email, setEmail] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [error, setError] = useState('');
	const emailInputId = useId();

	const { data: session } = useSession();
	const router = useRouter();

	// Redirect if already logged in
	useEffect(() => {
		if (session) {
			router.navigate({ to: '/account' });
		}
	}, [session, router]);

	const handleMagicLinkSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError('');

		try {
			await client.signIn.magicLink({
				email,
				callbackURL: '/account',
			});
			setEmailSent(true);
		} catch (err: unknown) {
			console.error('Magic link sign-in error:', err);
			const message =
				err instanceof Error
					? err.message
					: 'Failed to send magic link. Please try again.';
			setError(message);
		} finally {
			setIsLoading(false);
		}
	};

	if (emailSent) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
							<CheckCircle2 className="w-6 h-6 text-green-600" />
						</div>
						<CardTitle>Check Your Email</CardTitle>
						<CardDescription>
							We've sent a magic link to <strong>{email}</strong>
						</CardDescription>
					</CardHeader>
					<CardContent className="text-center">
						<p className="text-muted-foreground mb-6">
							Click the link in your email to sign in to your Irishette account.
							The link will expire in 15 minutes.
						</p>
						<Button
							variant="outline"
							onClick={() => {
								setEmailSent(false);
								setEmail('');
							}}
							className="w-full"
						>
							Send Another Link
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background flex items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
						<Mail className="w-6 h-6 text-primary" />
					</div>
					<CardTitle>Welcome Back</CardTitle>
					<CardDescription>
						Sign in to manage your bookings at Irishette
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleMagicLinkSignIn} className="space-y-4">
						<label
							htmlFor={emailInputId}
							className="block text-sm font-medium mb-2"
						>
							Email Address
						</label>
						<Input
							id={emailInputId}
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="Enter your email address"
							className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
							required
							disabled={isLoading}
						/>

						{error && (
							<div className="p-3 bg-red-50 border border-red-200 rounded-md">
								<p className="text-sm text-red-700">{error}</p>
							</div>
						)}

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading || !email}
						>
							{isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
							{isLoading ? 'Sending...' : 'Send Magic Link'}
						</Button>
					</form>

					<div className="mt-6 text-center">
						<p className="text-xs text-muted-foreground">
							We'll send you a secure link to sign in without a password. No
							account? We'll create one for you automatically.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
