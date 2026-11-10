import { Icon } from '@iconify/react';

import { useSession } from '@/lib/auth/session';
import { useBookingStore } from '@/stores';
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
		// Payment completes on the confirmation page (another route).
		{ step: 'payment', label: 'Payment', completed: false },
		{ step: 'confirmation', label: 'Confirmed', completed: false },
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
									item.completed || booking.currentStep === item.step
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
									item.completed || booking.currentStep === item.step
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
