import { Icon } from '@iconify/react';
import { type ComponentProps, useId, useState } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A number input that keeps what the admin types (empty, "0", "7.", ...)
 * instead of re-formatting on every keystroke, so a value can be cleared and
 * retyped, including 0. `scale` converts the shown number to the stored one
 * (100 for percentages stored as decimals). Empty means 0.
 */
function DecimalInput({
	value,
	onValueChange,
	scale = 1,
	...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
	value: number;
	onValueChange: (value: number) => void;
	scale?: number;
}) {
	const format = (v: number) => String(Number((v * scale).toFixed(2)));
	const parse = (text: string) => {
		const n = Number.parseFloat(text);
		return Number.isFinite(n) && n > 0 ? n / scale : 0;
	};
	const [draft, setDraft] = useState(() => format(value));
	// Re-sync when the value changes from outside (e.g. after saving), but not
	// while it matches what is being typed. Adjusting state during render:
	// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
	const [seen, setSeen] = useState(value);
	if (seen !== value) {
		setSeen(value);
		if (parse(draft) !== value) setDraft(format(value));
	}

	return (
		<Input
			{...props}
			type="number"
			inputMode="decimal"
			value={draft}
			onChange={(e) => {
				setDraft(e.target.value);
				onValueChange(parse(e.target.value));
			}}
			onBlur={() => setDraft(format(value))}
		/>
	);
}

interface RoomPricingConfigProps {
	basePrice: number;
	serviceFeeRate: number;
	stateTaxRate: number;
	cityTaxRate: number;
	maxGuests: number;
	onBasePriceChange: (value: number) => void;
	onServiceFeeRateChange: (value: number) => void;
	onStateTaxRateChange: (value: number) => void;
	onCityTaxRateChange: (value: number) => void;
	onMaxGuestsChange: (value: number) => void;
}

export function RoomPricingConfig({
	basePrice,
	serviceFeeRate,
	stateTaxRate,
	cityTaxRate,
	maxGuests,
	onBasePriceChange,
	onServiceFeeRateChange,
	onStateTaxRateChange,
	onCityTaxRateChange,
	onMaxGuestsChange,
}: RoomPricingConfigProps) {
	const maxGuestsId = useId();
	const basePriceId = useId();
	const serviceFeeRateId = useId();
	const stateTaxRateId = useId();
	const cityTaxRateId = useId();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Icon icon="tabler:settings-dollar" className="size-6" />
					Pricing, Tax & Guests
				</CardTitle>
				<CardDescription>
					Configure service fee and tax rates applied to room bookings. Any rate
					can be 0%; zero charges are left off the guest's checkout. Hotel
					occupancy tax is calculated on the room price plus the service fee.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					<Label htmlFor={maxGuestsId} className="mb-2 text-sm font-medium">
						Maximum Guests
					</Label>
					<Input
						id={maxGuestsId}
						type="number"
						step="1"
						min="1"
						max="10"
						value={maxGuests}
						onChange={(e) =>
							onMaxGuestsChange(
								Math.min(
									10,
									Math.max(1, Number.parseInt(e.target.value, 10) || 1),
								),
							)
						}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Enforced on new bookings (1-10). Existing bookings are not affected.
					</p>
				</div>

				<div>
					<Label htmlFor={basePriceId} className="mb-2 text-sm font-medium">
						Room Nightly Base Price (USD)
					</Label>
					<DecimalInput
						id={basePriceId}
						step="0.01"
						min="0"
						value={basePrice}
						onValueChange={onBasePriceChange}
						placeholder="0.00"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Current: ${basePrice.toFixed(2)}
					</p>
				</div>

				<div>
					<Label
						htmlFor={serviceFeeRateId}
						className="mb-2 text-sm font-medium"
					>
						Service Fee Rate (%)
					</Label>
					<DecimalInput
						id={serviceFeeRateId}
						step="0.01"
						min="0"
						max="100"
						scale={100}
						value={serviceFeeRate}
						onValueChange={onServiceFeeRateChange}
						placeholder="0.00"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Current: {(serviceFeeRate * 100).toFixed(2)}%
					</p>
				</div>

				<div>
					<Label htmlFor={stateTaxRateId} className="mb-2 text-sm font-medium">
						Texas Hotel Occupancy Tax Rate (%)
					</Label>
					<DecimalInput
						id={stateTaxRateId}
						step="0.01"
						min="0"
						max="100"
						scale={100}
						value={stateTaxRate}
						onValueChange={onStateTaxRateChange}
						placeholder="0.00"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Current: {(stateTaxRate * 100).toFixed(2)}%
					</p>
				</div>

				<div>
					<Label htmlFor={cityTaxRateId} className="mb-2 text-sm font-medium">
						City of Dublin Hotel Occupancy Tax Rate (%)
					</Label>
					<DecimalInput
						id={cityTaxRateId}
						step="0.01"
						min="0"
						max="100"
						scale={100}
						value={cityTaxRate}
						onValueChange={onCityTaxRateChange}
						placeholder="0.00"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Current: {(cityTaxRate * 100).toFixed(2)}%
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
