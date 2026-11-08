import { Icon } from '@iconify/react';

import { Button } from '@/components/ui/button';

import { AuthDivider } from './AuthCard';

/** "or" + the button that switches between the magic-link and password forms. */
export function AuthModeToggle({
	mode,
	onToggle,
	magicLabel,
}: {
	mode: 'magic' | 'password';
	onToggle: () => void;
	/** Label to switch back, e.g. "Email me a login link instead". */
	magicLabel: string;
}) {
	return (
		<>
			<AuthDivider label="or" />
			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={onToggle}
			>
				{mode === 'magic' ? (
					<>
						<Icon icon="tabler:lock-password" className="size-5" />
						Use a password instead
					</>
				) : (
					<>
						<Icon icon="tabler:mail-bolt" className="size-5" />
						{magicLabel}
					</>
				)}
			</Button>
		</>
	);
}
