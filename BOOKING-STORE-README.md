# Booking Store

This directory contains the booking state management system using TanStack Store for the Irishette booking flow.

## Overview

The booking store manages the multi-step booking process with persistent state that survives page refreshes and navigation. It uses localStorage to maintain state across browser sessions.

## Files

- **`booking-store.ts`** - Core store implementation with state management and actions
- **`use-booking-store.ts`** - React hooks for consuming the store in components
- **`index.ts`** - Convenient exports for easy importing

## Quick Start

```typescript
import { useBookingStore } from '@/stores'

function MyBookingComponent() {
  const booking = useBookingStore()
  
  // Access current state
  console.log(booking.currentStep) // 'dates' | 'auth' | 'details' | 'payment' | 'confirmation'
  console.log(booking.roomId)
  console.log(booking.checkInDate)
  
  // Use actions to update state
  booking.actions.setRoom('room-1', 'rose-room')
  booking.actions.setDates('2025-01-01', '2025-01-03')
  booking.actions.setGuestCount(2)
  
  // Navigate between steps
  if (booking.canProceed()) {
    booking.proceedToNext()
  }
  
  // Check validation
  const errors = booking.getValidationErrors()
  const isValid = booking.isValid.dates
  
  return <div>...</div>
}
```

## State Structure

```typescript
interface BookingState {
  // Room and dates
  roomId: string | null
  roomSlug: string | null
  checkInDate: string | null // ISO date string
  checkOutDate: string | null // ISO date string
  guestCount: number
  
  // Pricing
  pricing: PricingBreakdown | null
  
  // Guest information
  guestInfo: GuestInfo | null
  
  // Flow control
  currentStep: BookingStep // 'dates' | 'auth' | 'details' | 'payment' | 'confirmation'
  
  // Booking ID once created
  bookingId: string | null
  
  // Error handling
  error: string | null
  isLoading: boolean
  
  // Metadata
  createdAt: string | null
  updatedAt: string | null
}
```

## Actions

### Navigation Actions
- `setStep(step)` - Navigate to a specific step
- `proceedToNext()` - Go to next step if validation passes
- `reset()` - Clear all booking data and restart

### Data Actions
- `setRoom(roomId, roomSlug)` - Set the selected room
- `setDates(checkIn, checkOut)` - Set booking dates
- `setGuestCount(count)` - Set number of guests
- `setGuestInfo(info)` - Set guest details
- `setPricing(pricing)` - Set calculated pricing
- `setBookingId(id)` - Set booking ID after creation

### Utility Actions
- `setLoading(boolean)` - Set loading state
- `setError(message)` - Set error message
- `clearError()` - Clear current error
- `initializeBooking(roomId, roomSlug)` - Start fresh booking

## Validation Helpers

The store provides built-in validation for each step:

```typescript
// Check if can proceed from current step
booking.canProceed()

// Get validation errors for current step
booking.getValidationErrors()

// Check specific validations
booking.isValid.dates // Can proceed from dates step
booking.isValid.auth // Can proceed from auth step
booking.isValid.details // Can proceed from details step

// Check if booking has required data for specific steps
booking.actions.canProceedToAuth()
booking.actions.canProceedToDetails()
booking.actions.canProceedToPayment()
```

## Usage Patterns

### Basic Booking Flow

```typescript
// 1. Initialize booking
booking.actions.initializeBooking('room-1', 'rose-room')

// 2. Set dates and guests
booking.actions.setDates('2025-01-01', '2025-01-03')
booking.actions.setGuestCount(2)

// 3. Proceed to authentication
if (booking.canProceed()) {
  booking.actions.setStep('auth')
}

// 4. After auth, proceed to details
booking.actions.setStep('details')

// 5. Set guest information
booking.actions.setGuestInfo({
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1-555-0123'
})

// 6. Set pricing after calculation
booking.actions.setPricing({
  basePrice: 150,
  nights: 2,
  subtotal: 300,
  taxes: 45,
  fees: 20,
  totalAmount: 365,
  currency: 'USD'
})

// 7. Proceed to payment
booking.actions.setStep('payment')

// 8. After payment, set booking ID and confirm
booking.actions.setBookingId('booking-123')
booking.actions.setStep('confirmation')
```

### Error Handling

```typescript
// Set loading state during API calls
booking.actions.setLoading(true)

try {
  // Make API call
  const result = await api.createBooking(...)
  booking.actions.setBookingId(result.id)
} catch (error) {
  booking.actions.setError(error.message)
} finally {
  booking.actions.setLoading(false)
}
```

### Conditional Rendering

```typescript
function BookingFlow() {
  const booking = useBookingStore()
  
  if (booking.isStep('dates')) {
    return <DateSelection />
  }
  
  if (booking.isStep('auth')) {
    return <AuthenticationStep />
  }
  
  if (booking.isStep('details')) {
    return <BookingDetailsForm />
  }
  
  if (booking.isStep('payment')) {
    return <PaymentStep />
  }
  
  if (booking.isStep('confirmation')) {
    return <ConfirmationPage />
  }
  
  return null
}
```

## Persistence

The store automatically persists state to `localStorage` under the key `irishette-booking-draft`. This means:

- State survives page refreshes
- State survives browser tab closing/reopening
- State is restored when user returns to the site
- State is cleared when `booking.actions.reset()` is called

## Integration with tRPC

The store works seamlessly with your existing tRPC booking endpoints:

```typescript
// Calculate pricing
const pricing = await trpc.bookings.calculateBooking.mutate({
  roomId: booking.roomId!,
  checkInDate: booking.checkInDate!,
  checkOutDate: booking.checkOutDate!,
  guestCount: booking.guestCount
})
booking.actions.setPricing(pricing)

// Create booking
const result = await trpc.bookings.createBooking.mutate({
  ...booking.summary,
  userId: session.user.id
})
booking.actions.setBookingId(result.bookingId)

// Create checkout session
const checkout = await trpc.bookings.createCheckoutSession.mutate({
  bookingId: booking.bookingId!,
  successUrl: '...',
  cancelUrl: '...',
  userId: session.user.id
})
```

## Testing

You can test the store using the example component:

```typescript
import { BookingStoreExample } from '@/components/BookingStoreExample'

// Add this to any route to see the store in action
<BookingStoreExample />
```
