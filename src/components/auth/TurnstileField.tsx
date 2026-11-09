import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { type RefObject, useRef, useState } from 'react';

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
 * The Turnstile widget (invisible unless a challenge needs the user):
 * `<TurnstileField widgetRef={turnstile.ref} onToken={turnstile.setToken} />`.
 */
export function TurnstileField({
	widgetRef,
	onToken,
}: {
	widgetRef: RefObject<TurnstileInstance | null>;
	onToken: (token: string) => void;
}) {
	return (
		<Turnstile
			className="w-full"
			ref={widgetRef}
			siteKey={import.meta.env.VITE_TURNSTILE_PUBLIC_KEY}
			onSuccess={onToken}
			onError={() => onToken('')}
			onExpire={() => onToken('')}
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
	);
}
