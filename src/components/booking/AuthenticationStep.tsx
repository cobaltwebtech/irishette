import { Icon } from '@iconify/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { authClient, useSession } from '@/lib/auth-client';
import { useBookingStore } from '@/stores';

export function AuthenticationStep() {
	const booking = useBookingStore();
	const { data: session } = useSession();
	const [email, setEmail] = useState('');
	const [emailSent, setEmailSent] = useState(false);
	const [loading, setLoading] = useState(false);

	if (session?.user) {
		// User is already authenticated, advance to next step
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Icon icon="tabler:check" className="size-5 text-primary" />
						Welcome back, {session.user.name || session.user.email}!
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground mb-4">
						You're signed in and ready to continue with your booking.
					</p>
					<Button onClick={() => booking.actions.setStep('details')}>
						Continue to Booking Details
					</Button>
				</CardContent>
			</Card>
		);
	}

	const handleSendMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email || loading) return;

		setLoading(true);
		try {
			// Send magic link using Better Auth client-side API
			const { error } = await authClient.signIn.magicLink({
				email: email,
				callbackURL: '/booking', // Redirect back to booking after authentication
				newUserCallbackURL: '/booking', // Also redirect new users to booking
				errorCallbackURL: '/booking?error=auth', // Handle errors gracefully
			});

			if (error) {
				throw new Error(error.message || 'Failed to send magic link');
			}

			setEmailSent(true);
		} catch (error) {
			console.error('Error sending magic link:', error);
			alert('Failed to send magic link. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	if (emailSent) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Check Your Email</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground mb-4">
						We've sent a magic link to <strong>{email}</strong>. Click the link
						in your email to continue with your booking.
					</p>
					<p className="text-sm text-muted-foreground">
						Don't see the email? Check your spam folder or{' '}
						<button
							type="button"
							onClick={() => setEmailSent(false)}
							className="text-primary hover:underline"
						>
							try a different email address
						</button>
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign In to Continue</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground mb-4">
					We'll send you a magic link to continue with your booking. No password
					required!
				</p>
				<form onSubmit={handleSendMagicLink} className="space-y-4">
					<div>
						<Input
							type="email"
							placeholder="Enter your email address"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<Button type="submit" disabled={loading || !email} className="w-full">
						{loading ? 'Sending...' : 'Send Magic Link'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
