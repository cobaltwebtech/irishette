import { Icon } from '@iconify/react';
import { useId } from 'react';

import type {
	GuestDetailsErrors,
	GuestDetailsForm,
} from '@/components/booking/use-booking-details-submit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const REQUESTS_MAX = 1000;

interface GuestDetailsFieldsProps {
	form: GuestDetailsForm;
	errors: GuestDetailsErrors;
	onChange: <K extends keyof GuestDetailsForm>(
		field: K,
		value: GuestDetailsForm[K],
	) => void;
	/** The room's guest limit. */
	maxGuests: number;
}

/** Guest information and special requests on the booking details step. */
export function GuestDetailsFields({
	form,
	errors,
	onChange,
	maxGuests,
}: GuestDetailsFieldsProps) {
	return (
		<>
			<div className="space-y-4">
				<h3 className="text-lg font-semibold">Guest Information</h3>

				<div className="grid gap-4 sm:grid-cols-2">
					<TextField
						label="Full Name *"
						type="text"
						placeholder="Enter your full name"
						value={form.guestName}
						onChange={(value) => onChange('guestName', value)}
						error={errors.guestName}
					/>
					<TextField
						label="Email Address *"
						type="email"
						placeholder="Enter your email"
						value={form.guestEmail}
						onChange={(value) => onChange('guestEmail', value)}
						error={errors.guestEmail}
					/>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<TextField
						label="Phone Number *"
						type="tel"
						placeholder="Enter your phone number"
						value={form.guestPhone}
						onChange={(value) => onChange('guestPhone', value)}
						error={errors.guestPhone}
					/>
					<GuestCountField
						value={form.numberOfGuests}
						max={maxGuests}
						onChange={(value) => onChange('numberOfGuests', value)}
						error={errors.numberOfGuests}
					/>
				</div>
			</div>

			<SpecialRequestsField
				value={form.specialRequests}
				onChange={(value) => onChange('specialRequests', value)}
			/>
		</>
	);
}

function FieldError({ message }: { message?: string }) {
	return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

function TextField({
	label,
	type,
	placeholder,
	value,
	onChange,
	error,
}: {
	label: string;
	type: 'text' | 'email' | 'tel';
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={error ? 'border-red-500' : ''}
			/>
			<FieldError message={error} />
		</div>
	);
}

const STEPPER_BUTTON =
	'size-8 rounded-full border-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100';

function GuestCountField({
	value,
	max,
	onChange,
	error,
}: {
	value: number;
	max: number;
	onChange: (value: number) => void;
	error?: string;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Number of Guests *</Label>
			<div className="flex items-center gap-6">
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onChange(Math.max(1, value - 1))}
					disabled={value <= 1}
					className={STEPPER_BUTTON}
					aria-label="Decrease guest count"
				>
					<Icon icon="tabler:minus" className="size-5" />
				</Button>

				<div className="rounded-sm border border-border px-4 py-2">
					<div
						key={value}
						className="animate-in duration-200 zoom-in-50 fade-in"
					>
						<span className="text-xl font-semibold tabular-nums">{value}</span>
					</div>
				</div>

				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onChange(Math.min(max, value + 1))}
					disabled={value >= max}
					className={STEPPER_BUTTON}
					aria-label="Increase guest count"
				>
					<Icon icon="tabler:plus" className="size-5" />
				</Button>
			</div>
			<FieldError message={error} />
		</div>
	);
}

function SpecialRequestsField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Special Requests</Label>
			<Textarea
				id={id}
				placeholder="Any special requests or notes for your stay? (optional)"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={3}
				maxLength={REQUESTS_MAX}
			/>
			<p
				className={`text-xs ${
					value.length > 900
						? 'font-semibold text-destructive'
						: 'text-muted-foreground'
				}`}
			>
				{value.length} / {REQUESTS_MAX} characters
			</p>
			<p className="text-xs text-muted-foreground">
				Examples: dietary restrictions, accessibility needs, early check-in/late
				check-out requests, etc. <strong>Note:</strong> While we cannot
				guarantee all requests will be accommodated, we will make a best effort
				to honor them.
			</p>
		</div>
	);
}
