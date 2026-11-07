import { Icon } from '@iconify/react';
import { useId } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
					Configure service fee and tax rates applied to room bookings. Hotel
					occupancy tax is calculated on room price only (excluding service
					fees).
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
					<Input
						id={basePriceId}
						type="number"
						step="1.00"
						min="0"
						value={basePrice.toFixed(2)}
						onChange={(e) => onBasePriceChange(parseFloat(e.target.value) || 0)}
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
					<Input
						id={serviceFeeRateId}
						type="number"
						step="1.00"
						min="0"
						max="100"
						value={(serviceFeeRate * 100).toFixed(2)}
						onChange={(e) =>
							onServiceFeeRateChange(parseFloat(e.target.value) / 100 || 0)
						}
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
					<Input
						id={stateTaxRateId}
						type="number"
						step="0.01"
						min="0"
						max="100"
						value={(stateTaxRate * 100).toFixed(2)}
						onChange={(e) =>
							onStateTaxRateChange(parseFloat(e.target.value) / 100 || 0)
						}
						placeholder="6.00"
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						Current: {(stateTaxRate * 100).toFixed(1)}%
					</p>
				</div>

				<div>
					<Label htmlFor={cityTaxRateId} className="mb-2 text-sm font-medium">
						City of Dublin Hotel Occupancy Tax Rate (%)
					</Label>
					<Input
						id={cityTaxRateId}
						type="number"
						step="0.01"
						min="0"
						max="100"
						value={(cityTaxRate * 100).toFixed(2)}
						onChange={(e) =>
							onCityTaxRateChange(parseFloat(e.target.value) / 100 || 0)
						}
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
