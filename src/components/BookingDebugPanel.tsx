import { useEffect, useState } from 'react';
import { useBookingStore } from '@/stores';

/**
 * Debug component to show current booking state
 * Add this to any page to see the booking store state
 */
export function BookingDebugPanel() {
	const booking = useBookingStore();
	const [isClient, setIsClient] = useState(false);

	// Only render on client to avoid hydration mismatch
	useEffect(() => {
		setIsClient(true);
	}, []);

	if (!isClient || !booking.hasActiveBooking()) {
		return null;
	}

	return (
		<div className="fixed top-4 right-4 bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg z-50 max-w-sm">
			<h3 className="font-bold text-blue-700 mb-2">📋 Booking Debug</h3>
			<div className="text-xs space-y-1">
				<p>
					<strong>Step:</strong> {booking.currentStep}
				</p>
				<p>
					<strong>Room:</strong> {booking.roomSlug || 'None'}
				</p>
				<p>
					<strong>Check-in:</strong> {booking.checkInDate || 'None'}
				</p>
				<p>
					<strong>Check-out:</strong> {booking.checkOutDate || 'None'}
				</p>
				<p>
					<strong>Guests:</strong> {booking.guestCount}
				</p>
				<p>
					<strong>Total:</strong> $
					{booking.pricing?.totalAmount?.toFixed(2) || '0.00'}
				</p>
				<p>
					<strong>Can Proceed:</strong> {booking.canProceed() ? '✅' : '❌'}
				</p>
				{booking.getValidationErrors().length > 0 && (
					<div className="mt-2 text-red-600">
						<p>
							<strong>Errors:</strong>
						</p>
						<ul className="list-disc list-inside">
							{booking.getValidationErrors().map((error) => (
								<li key={error} className="text-xs">
									{error}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
			<button
				type="button"
				onClick={() => booking.actions.reset()}
				className="mt-2 bg-red-500 text-white px-2 py-1 rounded text-xs"
			>
				Reset
			</button>
		</div>
	);
}
