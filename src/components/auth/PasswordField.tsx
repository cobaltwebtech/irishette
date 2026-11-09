import { type ReactNode, useId } from 'react';

import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password';

/** Labelled password input (with show/hide toggle) used by the auth forms. */
export function PasswordField({
	label,
	labelAction,
	hint,
	value,
	onChange,
	...inputProps
}: {
	label: string;
	/** Shown at the end of the label row, e.g. "Forgot your password?". */
	labelAction?: ReactNode;
	/** Help text under the input. */
	hint?: ReactNode;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	autoComplete: 'current-password' | 'new-password';
	placeholder?: string;
	required?: boolean;
}) {
	const id = useId();
	const labelElement = <Label htmlFor={id}>{label}</Label>;
	return (
		<div className="flex flex-col gap-2">
			{labelAction ? (
				<div className="flex items-center">
					{labelElement}
					{labelAction}
				</div>
			) : (
				labelElement
			)}
			<PasswordInput
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				{...inputProps}
			/>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
