import { useState } from 'react';

export type AuthMode = 'magic' | 'password';

/**
 * Magic link / password switch of the login and signup forms (magic link
 * first). `onSwitch` clears state that belongs to the previous mode.
 */
export function useAuthMode(onSwitch: () => void) {
	const [mode, setMode] = useState<AuthMode>('magic');
	const toggleMode = () => {
		setMode(mode === 'magic' ? 'password' : 'magic');
		onSwitch();
	};
	return { mode, isMagic: mode === 'magic', toggleMode };
}
