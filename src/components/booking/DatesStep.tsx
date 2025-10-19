import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookingStore } from '@/stores';

export function DatesStep() {
	const booking = useBookingStore();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Select Your Dates</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground mb-4">
					Please go back to select your dates and room.
				</p>
				<Link
					to={
						booking.roomSlug === 'rose-room'
							? '/rooms/rose-room'
							: '/rooms/texas-room'
					}
				>
					<Button>Back to Room Selection</Button>
				</Link>
			</CardContent>
		</Card>
	);
}
