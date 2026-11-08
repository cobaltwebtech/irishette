import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Labelled email input used by every auth form. */
export function EmailField({
	value,
	onChange,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>Email</Label>
			<Input
				id={id}
				type="email"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Enter your email address"
				required
				disabled={disabled}
				autoComplete="email"
			/>
		</div>
	);
}
