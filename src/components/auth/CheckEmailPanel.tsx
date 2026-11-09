import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
	formatLinkLifetime,
	MAGIC_LINK_EXPIRES_IN,
} from '@/lib/auth-constants';

import { AuthCard } from './AuthCard';

/**
 * "Check your email" step after a magic link, verification or password reset
 * email was requested. `lifetime` is the link's real expiry
 * (formatLinkLifetime in src/lib/auth-constants.ts).
 */
export function CheckEmailPanel({
	email,
	purpose,
	lifetime,
	children,
	footer,
}: {
	email: string;
	/** What the link does, e.g. "sign in to your Irishette account". */
	purpose: string;
	lifetime: string;
	/** Actions (send again, go back). */
	children?: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<AuthCard
			icon="tabler:mail-fast"
			title="Check Your Email"
			description={
				<>
					<span className="block">We sent an email to:</span>
					<span className="block font-semibold">{email}</span>
				</>
			}
			footer={footer}
		>
			<p className="text-center text-muted-foreground" aria-live="polite">
				Click the link in the email to {purpose}. The link expires in {lifetime}
				. If you don&apos;t see the email, check your spam folder.
			</p>
			{children}
		</AuthCard>
	);
}

/** "Check your email" after a magic link request, with "Send another link". */
export function MagicLinkSentPanel({
	email,
	purpose,
	onSendAgain,
}: {
	email: string;
	purpose: string;
	onSendAgain: () => void;
}) {
	return (
		<CheckEmailPanel
			email={email}
			purpose={purpose}
			lifetime={formatLinkLifetime(MAGIC_LINK_EXPIRES_IN)}
		>
			<Button variant="secondary" className="w-full" onClick={onSendAgain}>
				<Icon icon="tabler:mail-share" className="size-5" />
				Send another link
			</Button>
		</CheckEmailPanel>
	);
}
