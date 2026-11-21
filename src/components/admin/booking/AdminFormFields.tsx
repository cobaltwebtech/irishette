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

/** How the money is taken: a card through Stripe or outside it. */
export function AdminPaymentChoice<V extends string>({
	legend,
	value,
	onChange,
	options,
}: {
	legend: string;
	value: V;
	onChange: (value: V) => void;
	options: Array<{ value: V; label: string; description: string }>;
}) {
	const name = useId();
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium">{legend}</legend>
			<div className="grid gap-2 sm:grid-cols-2">
				{options.map((option) => (
					<div
						key={option.value}
						className="space-y-1 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
					>
						<label className="flex cursor-pointer items-start gap-3 font-medium">
							<input
								type="radio"
								name={name}
								value={option.value}
								checked={value === option.value}
								onChange={() => onChange(option.value)}
								aria-describedby={`${name}-${option.value}`}
								className="mt-0.5 size-4 accent-primary"
							/>
							{option.label}
						</label>
						<p
							id={`${name}-${option.value}`}
							className="pl-7 text-muted-foreground"
						>
							{option.description}
						</p>
					</div>
				))}
			</div>
		</fieldset>
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
