import { format, parse, startOfMonth, subMonths } from 'date-fns';
import {
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	XAxis,
	YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@/components/ui/chart';

// Type for the monthly booking data from tRPC
type MonthlyBookingData = {
	month: string; // 'YYYY-MM' format from database
	bookings: number;
	revenue: number;
};

// Chart configuration for styling
const chartConfig = {
	bookings: {
		label: 'Bookings',
		color: 'var(--chart-1)',
	},
} satisfies ChartConfig;

interface BookingsChartProps {
	data: MonthlyBookingData[];
	isLoading?: boolean;
}

export function BookingsChart({ data, isLoading }: BookingsChartProps) {
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
		return existingData || { month, bookings: 0, revenue: 0 };
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

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Monthly Bookings</CardTitle>
					<p className="text-sm text-muted-foreground">
						Last 12 months of confirmed bookings
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
				<CardTitle>Monthly Bookings</CardTitle>
				<p className="text-sm text-muted-foreground">
					Last 12 months of confirmed bookings
				</p>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig}>
					<BarChart
						accessibilityLayer
						data={formattedData}
						margin={{
							top: 20,
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
							allowDecimals={false}
						/>
						<ChartTooltip
							cursor={false}
							content={<ChartTooltipContent hideLabel />}
						/>
						<Bar dataKey="bookings" fill="var(--color-bookings)" radius={8}>
							<LabelList
								position="top"
								offset={12}
								className="fill-foreground"
								fontSize={12}
							/>
						</Bar>
					</BarChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
