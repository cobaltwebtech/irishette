import { Icon } from '@iconify/react';
import { useId, useState } from 'react';

import { useAuthRequest } from '@/components/auth/useAuthRequest';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeEmail } from '@/lib/auth/auth-client';
import {
	EMAIL_VERIFICATION_EXPIRES_IN,
	formatLinkLifetime,
} from '@/lib/auth/auth-constants';
import { emailSchema } from '@/lib/auth/auth-validation';

/**
 * Email change through Better Auth's changeEmail: a verified account approves
 * the change from its current address, then verifies the new one. The email
 * (and where admin emails go) changes only after both links are opened.
 */
export function EmailSettingsCard({
	profile,
}: {
	profile: { email: string; emailVerified: boolean };
}) {
	const inputId = useId();
	const [newEmail, setNewEmail] = useState('');
	const [sentTo, setSentTo] = useState<string | null>(null);
	const { isLoading, error, setError, run, validate } = useAuthRequest();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = validate(emailSchema, { email: newEmail.trim() });
		if (!parsed) return;
		if (parsed.email.toLowerCase() === profile.email.toLowerCase()) {
			setError('That is already your email address.');
			return;
		}
		await run(
			() =>
				changeEmail({
					newEmail: parsed.email,
					callbackURL: '/admin/settings',
				}),
			{
				onSuccess: () => {
					setSentTo(parsed.email);
					setNewEmail('');
				},
			},
		);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="tabler:mail" className="size-5" />
					Email address
				</CardTitle>
				<CardDescription>
					You sign in with this address, and admin notifications go to it.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium break-all">{profile.email}</span>
					{profile.emailVerified ? (
						<Badge variant="secondary">
							<Icon icon="tabler:circle-check" />
							Verified
						</Badge>
					) : (
						<Badge variant="outline">Not verified</Badge>
					)}
				</div>

				{sentTo ? (
					<Alert>
						<Icon icon="tabler:mail-fast" className="size-4" />
						<AlertTitle>Check your email</AlertTitle>
						<AlertDescription>
							<p>
								{profile.emailVerified ? (
									<>
										We sent a link to <strong>{profile.email}</strong> to
										approve the change. After you approve it, we send a link to{' '}
										<strong>{sentTo}</strong> to verify the new address.
									</>
								) : (
									<>
										We sent a link to <strong>{sentTo}</strong> to verify the
										new address.
									</>
								)}{' '}
								Your email stays the same until then. Links expire in{' '}
								{formatLinkLifetime(EMAIL_VERIFICATION_EXPIRES_IN)}.
							</p>
							<Button
								variant="link"
								className="h-auto p-0"
								onClick={() => setSentTo(null)}
							>
								Use a different address
							</Button>
						</AlertDescription>
					</Alert>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor={inputId}>New email address</Label>
							<Input
								id={inputId}
								type="email"
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								autoComplete="email"
								disabled={isLoading}
								required
							/>
						</div>
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						)}
						<Button type="submit" disabled={isLoading || !newEmail.trim()}>
							{isLoading && (
								<Icon icon="tabler:loader-2" className="animate-spin" />
							)}
							Change email
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
