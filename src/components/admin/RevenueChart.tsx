import { format, parse, startOfMonth, subMonths } from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@/components/ui/chart';

// Type for the monthly revenue data from tRPC
type MonthlyRevenueData = {
	month: string; // 'YYYY-MM' format from database
	baseRevenue: number;
};

// Chart configuration for styling
const chartConfig = {
	baseRevenue: {
		label: 'Revenue',
		color: 'var(--chart-2)',
	},
} satisfies ChartConfig;

interface RevenueChartProps {
	data: MonthlyRevenueData[];
	isLoading?: boolean;
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
	// Generate all 12 months from 11 months ago to current month
	const generateLast12Months = () => {
		const months: string[] = [];
		const currentDate = startOfMonth(new Date());

		for (let i = 11; i >= 0; i--) {
			const monthDate = subMonths(currentDate, i);
			months.push(format(monthDate, 'yyyy-MM'));
		}

		return months;
	};

	// Create a map of existing data for quick lookup
	const dataMap = new Map(data.map((item) => [item.month, item]));

	// Generate complete data with all 12 months, filling gaps with zero
	const allMonths = generateLast12Months();
	const completeData = allMonths.map((month) => {
		const existingData = dataMap.get(month);
		return existingData || { month, baseRevenue: 0 };
	});

	// Format data for display with better month labels
	const formattedData = completeData.map((item) => {
		try {
			// Parse 'YYYY-MM' format and format as 'MMM yyyy' (e.g., "Jan 2024")
			const date = parse(item.month, 'yyyy-MM', new Date());
			return {
				...item,
				monthLabel: format(date, 'MMM yyyy'),
			};
		} catch {
			// Fallback to original month string if parsing fails
			return {
				...item,
				monthLabel: item.month,
			};
		}
	});

	// Calculate total revenue for display
	const totalRevenue = formattedData.reduce(
		(sum, item) => sum + item.baseRevenue,
		0,
	);

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Monthly Revenue</CardTitle>
					<p className="text-sm text-muted-foreground">
						Last 12 months of confirmed booking revenue (base amount)
					</p>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center h-[300px] md:h-[400px] text-muted-foreground">
						Loading chart data...
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Monthly Revenue</CardTitle>
				<p className="text-sm text-muted-foreground">
					Last 12 months of confirmed booking revenue (base amount)
				</p>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig}>
					<AreaChart
						accessibilityLayer
						data={formattedData}
						margin={{
							top: 60,
							left: 12,
							right: 12,
						}}
						className="h-[300px] md:h-[400px]"
					>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="monthLabel"
							tickLine={false}
							tickMargin={10}
							axisLine={false}
							angle={-45}
							textAnchor="end"
							height={80}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							tickFormatter={(value) => `$${value.toLocaleString()}`}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									indicator="dot"
									hideLabel
									formatter={(value) =>
										`$${Number(value).toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2,
										})}`
									}
								/>
							}
						/>
						<Area
							dataKey="baseRevenue"
							type="linear"
							fill="var(--color-baseRevenue)"
							fillOpacity={0.4}
							stroke="var(--color-baseRevenue)"
							strokeWidth={2}
						/>
					</AreaChart>
				</ChartContainer>
				<div className="mt-4 pt-4 border-t">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							Total Revenue (12 months)
						</span>
						<span className="font-semibold text-lg">
							$
							{totalRevenue.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
