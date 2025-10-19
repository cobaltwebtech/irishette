import { Check } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { type BookingStep, useBookingStore } from '@/stores';
import type { BookingStepItem } from '@/utils/booking-utils';

export function BookingProgressSteps() {
	const booking = useBookingStore();
	const { data: session } = useSession();

	const steps: BookingStepItem[] = [
		{
			step: 'dates',
			label: 'Dates',
			completed: booking.isValid.dates,
		},
		{ step: 'auth', label: 'Sign In', completed: !!session?.user },
		{
			step: 'details',
			label: 'Details',
			completed: booking.isValid.details,
		},
		{
			step: 'confirmation',
			label: 'Confirmed',
			completed: booking.isStep('confirmation'),
		},
	];

	return (
		<div className="bg-muted/20 border-b">
			<div className="container mx-auto max-w-4xl px-4 py-6">
				<div className="flex items-center justify-between">
					{steps.map((item, index) => (
						<div key={item.step} className="flex items-center">
							<div
								className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
									item.completed || booking.isStep(item.step as BookingStep)
										? 'bg-primary border-primary text-primary-foreground'
										: 'bg-background border-muted-foreground text-muted-foreground'
								}`}
							>
								{item.completed ? (
									<Check className="w-4 h-4" />
								) : (
									<span className="text-sm font-medium">{index + 1}</span>
								)}
							</div>
							<span
								className={`ml-2 text-sm font-medium ${
									item.completed || booking.isStep(item.step as BookingStep)
										? 'text-foreground'
										: 'text-muted-foreground'
								}`}
							>
								{item.label}
							</span>
							{index < 3 && (
								<div
									className={`w-8 h-0.5 ml-4 ${
										item.completed ? 'bg-primary' : 'bg-muted'
									}`}
								/>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
