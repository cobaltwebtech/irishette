import { Icon } from '@iconify/react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useState } from 'react';
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
	const [isLoading, setIsLoading] = useState(false);
	const [turnstileToken, setTurnstileToken] = useState('');
	const turnstileRef = useRef<TurnstileInstance>(null);

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
		if (!email || isLoading) return;

		setIsLoading(true);
		try {
			// Send magic link using Better Auth client-side API
			const { error } = await authClient.signIn.magicLink({
				email: email,
				callbackURL: '/booking', // Redirect back to booking after authentication
				newUserCallbackURL: '/booking', // Also redirect new users to booking
				errorCallbackURL: '/booking?error=auth', // Handle errors gracefully
				fetchOptions: {
					headers: {
						'x-captcha-response': turnstileToken,
					},
				},
			});

			if (error) {
				throw new Error(error.message || 'Failed to send magic link');
			}

			setEmailSent(true);
		} catch (error) {
			console.error('Error sending magic link:', error);
			alert('Failed to send magic link. Please try again.');
			// Reset turnstile on error
			turnstileRef.current?.reset();
			setTurnstileToken('');
		} finally {
			setIsLoading(false);
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
				<CardTitle className="text-lg flex items-center gap-2">
					<Icon icon="tabler:user-circle" className="size-6" />
					Sign In to Continue
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-muted-foreground">
					We'll send you a magic link to continue with your booking. No password
					required!
				</p>
				<p className="text-muted-foreground">
					Don't worry, if you don't have an account yet we will create one for
					you automatically.
				</p>
				<form onSubmit={handleSendMagicLink} className="space-y-4">
					<div>
						<Input
							type="email"
							placeholder="Enter your email address"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
					<Turnstile
						ref={turnstileRef}
						siteKey={import.meta.env.VITE_TURNSTILE_PUBLIC_KEY}
						onSuccess={(token: string) => setTurnstileToken(token)}
						onError={() => {
							setTurnstileToken('');
							alert('Captcha verification failed. Please try again.');
						}}
						onExpire={() => setTurnstileToken('')}
						options={{
							appearance: 'interaction-only',
							theme: 'light',
							size: 'flexible',
						}}
						style={{
							display: 'block',
							width: '100%',
							minWidth: '300px',
							height: '65px',
						}}
					/>
					<Button
						type="submit"
						disabled={isLoading || !email || !turnstileToken}
						className="w-full"
					>
						{isLoading ? (
							<>
								<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
								Sending Magic Link...
							</>
						) : (
							<>
								<Icon icon="tabler:mail" className="size-5" />
								Send Magic Link
							</>
						)}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
