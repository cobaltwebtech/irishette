import { useId } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
	NativeSelect,
	NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

// Fields shared by the admin booking and modify pages (plan 06).

/** Room picker (active rooms by public id). */
export function AdminRoomSelect({
	rooms,
	value,
	onChange,
	placeholder,
}: {
	rooms: Array<{ publicId: string; name: string }>;
	value: string;
	onChange: (value: string) => void;
	/** Shown while nothing is picked (new bookings). */
	placeholder?: string;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Room</Label>
			<NativeSelect
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full sm:w-72"
			>
				{placeholder && (
					<NativeSelectOption value="" disabled>
						{placeholder}
					</NativeSelectOption>
				)}
				{rooms.map((r) => (
					<NativeSelectOption key={r.publicId} value={r.publicId}>
						{r.name}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
	);
}

/** An admins-only note (internal notes, change notes). */
export function AdminNoteField({
	label,
	value,
	onChange,
	maxLength,
	rows = 2,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	maxLength: number;
	rows?: number;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Textarea
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				maxLength={maxLength}
				rows={rows}
			/>
		</div>
	);
}

/** A confirmation checkbox with its label (consent, acknowledgements). */
export function AdminCheckbox({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
}) {
	const id = useId();
	return (
		<div className="flex items-start gap-3">
			<Checkbox
				id={id}
				className="size-5"
				checked={checked}
				onCheckedChange={(value) => onChange(value === true)}
			/>
			<Label htmlFor={id} className="text-sm leading-snug font-normal">
				{label}
			</Label>
		</div>
	);
}
