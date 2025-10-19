import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useBookingStore } from '@/stores';

export function BookingHeader() {
	const booking = useBookingStore();

	return (
		<div className="border-b bg-white">
			<div className="container mx-auto max-w-4xl px-4 py-4">
				<div className="flex items-center justify-between">
					<Link
						to={
							booking.roomSlug === 'rose-room'
								? '/rooms/rose-room'
								: '/rooms/texas-room'
						}
						className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Room
					</Link>
					<div className="text-sm text-muted-foreground">
						Booking: {booking.roomName || booking.roomSlug || 'Room'}
					</div>
				</div>
			</div>
		</div>
	);
}
