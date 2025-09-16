import { useBookingStore } from '@/stores';

/**
 * Simple example showing basic usage of the booking store
 * This demonstrates the key patterns for using the store in your components
 */
export function BookingStoreExample() {
	const booking = useBookingStore();

	return (
		<div className="p-6 max-w-lg mx-auto">
			<h2 className="text-2xl font-bold mb-4">Booking Store Example</h2>

			{/* Current state display */}
			<div className="bg-gray-100 p-4 rounded-lg mb-4">
				<h3 className="font-semibold mb-2">Current State:</h3>
				<p>Step: {booking.currentStep}</p>
				<p>Room: {booking.roomSlug || 'None selected'}</p>
				<p>
					Dates: {booking.checkInDate || 'None'} to{' '}
					{booking.checkOutDate || 'None'}
				</p>
				<p>Guests: {booking.guestCount}</p>
				<p>Can proceed: {booking.canProceed() ? 'Yes' : 'No'}</p>
			</div>

			{/* Basic usage examples */}
			<div className="space-y-4">
				{/* Example: Initialize booking */}
				<div>
					<h4 className="font-semibold">1. Initialize Booking:</h4>
					<button
						type="button"
						onClick={() =>
							booking.actions.initializeBooking('room-1', 'rose-room')
						}
						className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
					>
						Start Rose Room Booking
					</button>
				</div>

				{/* Example: Set dates */}
				<div>
					<h4 className="font-semibold">2. Set Dates:</h4>
					<button
						type="button"
						onClick={() => {
							const today = new Date();
							const tomorrow = new Date(today);
							tomorrow.setDate(tomorrow.getDate() + 1);
							const checkout = new Date(today);
							checkout.setDate(checkout.getDate() + 3);

							booking.actions.setDates(
								tomorrow.toISOString().split('T')[0],
								checkout.toISOString().split('T')[0],
							);
						}}
						className="bg-green-500 text-white px-3 py-1 rounded text-sm"
					>
						Set Tomorrow → +3 Days
					</button>
				</div>

				{/* Example: Set guest info */}
				<div>
					<h4 className="font-semibold">3. Set Guest Info:</h4>
					<button
						type="button"
						onClick={() =>
							booking.actions.setGuestInfo({
								name: 'John Doe',
								email: 'john@example.com',
								phone: '+1-555-0123',
							})
						}
						className="bg-purple-500 text-white px-3 py-1 rounded text-sm"
					>
						Set Sample Guest Info
					</button>
				</div>

				{/* Example: Navigate steps */}
				<div>
					<h4 className="font-semibold">4. Navigation:</h4>
					<div className="space-x-2">
						<button
							type="button"
							onClick={() => booking.actions.setStep('dates')}
							className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
						>
							Dates
						</button>
						<button
							type="button"
							onClick={() => booking.actions.setStep('auth')}
							className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
						>
							Auth
						</button>
						<button
							type="button"
							onClick={() => booking.actions.setStep('details')}
							className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
						>
							Details
						</button>
					</div>
				</div>

				{/* Example: Reset */}
				<div>
					<h4 className="font-semibold">5. Reset:</h4>
					<button
						type="button"
						onClick={() => booking.actions.reset()}
						className="bg-red-500 text-white px-3 py-1 rounded text-sm"
					>
						Reset Booking
					</button>
				</div>
			</div>

			{/* Show validation errors */}
			{booking.getValidationErrors().length > 0 && (
				<div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
					<h4 className="font-semibold text-red-700">Validation Errors:</h4>
					<ul className="list-disc list-inside text-red-600 text-sm">
						{booking.getValidationErrors().map((error) => (
							<li key={error}>{error}</li>
						))}
					</ul>
				</div>
			)}

			{/* Usage instructions */}
			<div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
				<h4 className="font-semibold text-blue-700 mb-2">
					Usage in Components:
				</h4>
				<pre className="text-xs text-blue-600 overflow-x-auto">
					{`// Import the hook
import { useBookingStore } from '@/stores'

// Use in component
const booking = useBookingStore()

// Access state
booking.currentStep
booking.roomId
booking.checkInDate

// Use actions
booking.actions.setRoom('room-1', 'rose-room')
booking.actions.setDates('2025-01-01', '2025-01-03')
booking.actions.proceedToNext()

// Check validation
booking.canProceed()
booking.getValidationErrors()`}
				</pre>
			</div>
		</div>
	);
}
