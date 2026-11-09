import { Icon } from '@iconify/react';
import { useState } from 'react';

import { AuthError } from '@/components/auth/AuthCard';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { EmailField } from '@/components/auth/EmailField';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import {
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
} from '@/lib/auth-constants';
import { emailSchema } from '@/lib/auth-validation';
import { useSession } from '@/lib/session';
import { useBookingStore } from '@/stores';

export function AuthenticationStep() {
	const booking = useBookingStore();
	const session = useSession();
	const [email, setEmail] = useState('');
	const [emailSent, setEmailSent] = useState(false);
	const turnstile = useTurnstile();
	const { isLoading, error, run, validate } = useAuthRequest(turnstile);

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
					<p className="mb-4 text-muted-foreground">
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
		if (isLoading) return;
		const data = validate(emailSchema, { email });
		if (!data) return;

		// New and existing users both come back to the booking.
		await run(
			() =>
				authClient.signIn.magicLink({
					email: data.email,
					callbackURL: '/booking',
					newUserCallbackURL: '/booking',
					errorCallbackURL: '/booking?error=auth',
					fetchOptions: { headers: turnstile.headers },
				}),
			{ onSuccess: () => setEmailSent(true) },
		);
	};

	if (emailSent) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Check Your Email</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-muted-foreground">
						We've sent a magic link to <strong>{email}</strong>. Click the link
						in your email to continue with your booking. The link expires in{' '}
						{formatLinkLifetime(MAGIC_LINK_EXPIRES_IN)}.
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
				<CardTitle className="flex items-center gap-2 text-lg">
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
				<form onSubmit={handleSendMagicLink} className="space-y-4" noValidate>
					<EmailField value={email} onChange={setEmail} disabled={isLoading} />
					<AuthError message={error} />
					<TurnstileField
						widgetRef={turnstile.ref}
						onToken={turnstile.setToken}
					/>
					<AuthSubmitButton
						isLoading={isLoading}
						disabled={!email || !turnstile.token}
						loadingLabel="Sending Magic Link..."
						icon="tabler:mail"
					>
						Send Magic Link
					</AuthSubmitButton>
				</form>
			</CardContent>
		</Card>
	);
}
