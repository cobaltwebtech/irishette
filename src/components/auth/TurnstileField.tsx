import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { type RefObject, useRef, useState } from 'react';

import { cn } from '@/utils/twMerge';

/**
 * State for one Turnstile widget. Tokens are single-use (Siteverify redeems
 * each once), so call `reset()` after every request that sent `headers`,
 * successful or not, before the form can be submitted again.
 */
export function useTurnstile() {
	const ref = useRef<TurnstileInstance>(null);
	const [token, setToken] = useState('');
	return {
		ref,
		token,
		setToken,
		/** Header Better Auth's captcha plugin reads. */
		headers: { 'x-captcha-response': token },
		/** Drops the used token and asks the widget for a new one. */
		reset() {
			setToken('');
			ref.current?.reset();
		},
	};
}

/**
 * The Turnstile widget:
 * `<TurnstileField widgetRef={turnstile.ref} onToken={turnstile.setToken} />`.
 *
 * With `appearance: 'interaction-only'` Turnstile usually passes without
 * showing anything, so the field takes no space (it stays rendered, only out
 * of the layout, so the challenge keeps running). It appears when Turnstile
 * needs the user (`before-interactive-callback`) or has an error or timeout
 * to show, and then stays visible (no layout shift after the user solves it).
 */
export function TurnstileField({
	widgetRef,
	onToken,
}: {
	widgetRef: RefObject<TurnstileInstance | null>;
	onToken: (token: string) => void;
}) {
	const [visible, setVisible] = useState(false);
	return (
		<div
			className={cn(
				'w-full',
				!visible && 'pointer-events-none absolute size-0 overflow-hidden',
			)}
		>
			<Turnstile
				className="w-full"
				ref={widgetRef}
				siteKey={import.meta.env.VITE_TURNSTILE_PUBLIC_KEY}
				onSuccess={onToken}
				onError={() => {
					setVisible(true);
					onToken('');
				}}
				onExpire={() => onToken('')}
				onTimeout={() => {
					setVisible(true);
					onToken('');
				}}
				onBeforeInteractive={() => setVisible(true)}
				onUnsupported={() => setVisible(true)}
				options={{
					appearance: 'interaction-only',
					theme: 'light',
					size: 'flexible',
				}}
			/>
		</div>
	);
}
