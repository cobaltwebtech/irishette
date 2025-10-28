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
	onBasePriceChange: (value: number) => void;
	onServiceFeeRateChange: (value: number) => void;
	onStateTaxRateChange: (value: number) => void;
	onCityTaxRateChange: (value: number) => void;
}

export function RoomPricingConfig({
	basePrice,
	serviceFeeRate,
	stateTaxRate,
	cityTaxRate,
	onBasePriceChange,
	onServiceFeeRateChange,
	onStateTaxRateChange,
	onCityTaxRateChange,
}: RoomPricingConfigProps) {
	const basePriceId = useId();
	const serviceFeeRateId = useId();
	const stateTaxRateId = useId();
	const cityTaxRateId = useId();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg flex items-center gap-2">
					<Icon icon="tabler:settings-dollar" className="size-6" />
					Pricing & Tax Configuration
				</CardTitle>
				<CardDescription>
					Configure service fee and tax rates applied to room bookings. Hotel
					occupancy tax is calculated on room price only (excluding service
					fees).
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div>
					<Label htmlFor={basePriceId} className="text-sm font-medium mb-2">
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
					<p className="text-xs text-muted-foreground mt-1">
						Current: ${basePrice.toFixed(2)}
					</p>
				</div>

				<div>
					<Label
						htmlFor={serviceFeeRateId}
						className="text-sm font-medium mb-2"
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
					<p className="text-xs text-muted-foreground mt-1">
						Current: {(serviceFeeRate * 100).toFixed(2)}%
					</p>
				</div>

				<div>
					<Label htmlFor={stateTaxRateId} className="text-sm font-medium mb-2">
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
					<p className="text-xs text-muted-foreground mt-1">
						Current: {(stateTaxRate * 100).toFixed(1)}%
					</p>
				</div>

				<div>
					<Label htmlFor={cityTaxRateId} className="text-sm font-medium mb-2">
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
					<p className="text-xs text-muted-foreground mt-1">
						Current: {(cityTaxRate * 100).toFixed(2)}%
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
