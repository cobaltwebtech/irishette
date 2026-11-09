import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** Full-width submit button of an auth form, with a spinner while loading. */
export function AuthSubmitButton({
	isLoading,
	disabled,
	loadingLabel,
	icon,
	children,
}: {
	isLoading: boolean;
	/** Extra reasons to disable it (empty fields, no Turnstile token). */
	disabled: boolean;
	loadingLabel: string;
	/** Iconify icon shown before the idle label. */
	icon?: string;
	children: ReactNode;
}) {
	return (
		<Button type="submit" className="w-full" disabled={isLoading || disabled}>
			{isLoading ? (
				<>
					<Icon icon="tabler:loader-2" className="size-5 animate-spin" />
					{loadingLabel}
				</>
			) : (
				<>
					{icon && <Icon icon={icon} className="size-5" />}
					{children}
				</>
			)}
		</Button>
	);
}
