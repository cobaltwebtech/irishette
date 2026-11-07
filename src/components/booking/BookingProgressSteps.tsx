import { Icon } from '@iconify/react';

import { useSession } from '@/lib/session';
import { type BookingStep, useBookingStore } from '@/stores';
import type { BookingStepItem } from '@/utils/booking-utils';

export function BookingProgressSteps() {
	const booking = useBookingStore();
	const session = useSession();

	const steps: BookingStepItem[] = [
		{ step: 'auth', label: 'Sign In', completed: !!session?.user },
		{
			step: 'details',
			label: 'Details',
			completed: booking.isValid.details,
		},
		{
			step: 'payment',
			label: 'Payment',
			completed: booking.isStep('confirmation'),
		},
		{
			step: 'confirmation',
			label: 'Confirmed',
			completed: booking.isStep('confirmation'),
		},
	];

	return (
		<div className="border-b bg-muted">
			<div className="container mx-auto max-w-4xl px-4 py-6">
				<h2 className="mb-4 text-center text-2xl font-bold">
					Booking Progress
				</h2>
				<div className="flex flex-wrap items-center justify-between gap-4">
					{steps.map((item, index) => (
						<div key={item.step} className="flex items-center">
							<div
								className={`flex size-8 items-center justify-center rounded-full ${
									item.completed || booking.isStep(item.step as BookingStep)
										? 'bg-primary text-primary-foreground'
										: 'bg-background text-muted-foreground'
								}`}
							>
								{item.completed ? (
									<Icon icon="tabler:check" className="size-4" />
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
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
