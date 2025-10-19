# Booking Components - Quick Reference

## File Locations

```
src/
├── routes/
│   └── booking.tsx (217 lines) - Main route orchestrator
└── components/
    └── booking/
        ├── index.ts - Barrel exports
        ├── types.ts - Shared utilities
        ├── BookingHeader.tsx
        ├── BookingProgressSteps.tsx
        ├── DatesStep.tsx
        ├── AuthenticationStep.tsx
        ├── BookingDetailsStep.tsx
        ├── ConfirmationStep.tsx
        └── BookingSummary.tsx
```

## Import Examples

### Import all components
```tsx
import {
  BookingHeader,
  BookingProgressSteps,
  DatesStep,
  AuthenticationStep,
  BookingDetailsStep,
  ConfirmationStep,
  BookingSummary,
} from '@/components/booking';
```

### Import utilities
```tsx
import { parseISODateString } from '@/components/booking';
```

### Import types
```tsx
import type { BookingStepItem } from '@/components/booking';
```

## Component API

### BookingHeader
```tsx
<BookingHeader />
```
**Props:** None (reads from store)
**Store Dependencies:** `roomSlug`, `roomName`

### BookingProgressSteps
```tsx
<BookingProgressSteps />
```
**Props:** None (reads from store + session)
**Store Dependencies:** `isValid.dates`, `isValid.details`, `currentStep`

### DatesStep
```tsx
<DatesStep />
```
**Props:** None (reads from store)
**Store Dependencies:** `roomSlug`

### AuthenticationStep
```tsx
<AuthenticationStep />
```
**Props:** None (reads from store + session)
**Store Dependencies:** `actions.setStep()`

### BookingDetailsStep
```tsx
<BookingDetailsStep />
```
**Props:** None (reads from store + session)
**Store Dependencies:** All booking properties, all actions

### ConfirmationStep
```tsx
<ConfirmationStep />
```
**Props:** None (reads from store)
**Store Dependencies:** `bookingId`, `summary`, `guestInfo`, `actions.reset()`

### BookingSummary
```tsx
<BookingSummary />
```
**Props:** None (reads from store)
**Store Dependencies:** `summary`, `guestInfo`, `currentStep`

## Common Patterns

### Adding a New Step

1. Create component file: `src/components/booking/NewStep.tsx`
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBookingStore } from '@/stores';

export function NewStep() {
  const booking = useBookingStore();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Step</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Your content */}
      </CardContent>
    </Card>
  );
}
```

2. Export in `index.ts`:
```tsx
export { NewStep } from './NewStep';
```

3. Import in main route:
```tsx
import { ..., NewStep } from '@/components/booking';
```

4. Add to render logic:
```tsx
{booking.isStep('newstep') && <NewStep />}
```

### Accessing Booking State

```tsx
const booking = useBookingStore();

// Read values
const roomId = booking.roomId;
const dates = { checkIn: booking.checkInDate, checkOut: booking.checkOutDate };

// Check state
if (booking.hasActiveBooking()) { }
if (booking.isStep('details')) { }
if (booking.isValid.dates) { }

// Update state
booking.actions.setRoom(id, slug, name);
booking.actions.setDates(checkIn, checkOut);
booking.actions.setGuestInfo({ name, email, phone });
booking.actions.setPricing({ ...pricing });
booking.actions.setStep('confirmation');
booking.actions.setError('Error message');
booking.actions.clearError();
booking.actions.reset();
```

### Accessing Session

```tsx
import { useSession } from '@/lib/auth-client';

const { data: session } = useSession();

if (session?.user) {
  const userId = session.user.id;
  const userName = session.user.name;
  const userEmail = session.user.email;
}
```

### Using tRPC

```tsx
import { trpcClient } from '@/integrations/tanstack-query/root-provider';

// Query
const room = await trpcClient.rooms.get.query({ id: roomId });

// Mutation
const result = await trpcClient.bookings.createBooking.mutate({
  roomId,
  checkInDate,
  checkOutDate,
  // ...other fields
});
```

### Date Formatting

```tsx
import { parseISODateString } from '@/components/booking';

const date = parseISODateString('2025-10-19');
const formatted = date.toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
// Output: "Sunday, October 19, 2025"
```

## Styling Conventions

### Card Layout (Standard)
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title Here</CardTitle>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Content with 24px vertical spacing */}
  </CardContent>
</Card>
```

### Form Fields
```tsx
<div className="space-y-2">
  <label htmlFor={id} className="text-sm font-medium">
    Field Label *
  </label>
  <Input
    id={id}
    type="text"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    className={error ? 'border-red-500' : ''}
  />
  {error && <p className="text-sm text-red-600">{error}</p>}
</div>
```

### Grid Layouts
```tsx
<div className="grid sm:grid-cols-2 gap-4">
  {/* 2 columns on small screens and up */}
</div>

<div className="grid lg:grid-cols-3 gap-8">
  {/* 3 columns on large screens and up */}
</div>
```

### Spacing
- `space-y-2` = 8px vertical spacing (form fields)
- `space-y-4` = 16px vertical spacing (sections)
- `space-y-6` = 24px vertical spacing (major sections)
- `gap-4` = 16px grid gap
- `gap-8` = 32px grid gap

## Error Handling

### Display Errors
```tsx
{booking.error && (
  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
    <p className="text-sm text-destructive">{booking.error}</p>
  </div>
)}
```

### Set Errors
```tsx
try {
  // Operation
} catch (error) {
  booking.actions.setError(
    error instanceof Error 
      ? error.message 
      : 'An error occurred'
  );
}
```

### Clear Errors
```tsx
booking.actions.clearError();
```

## Loading States

### Button Loading
```tsx
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</Button>
```

### Full Page Loading
```tsx
if (!isHydrated) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}
```

## Conditional Rendering

### Step-based
```tsx
{booking.isStep('dates') && <DatesStep />}
{booking.isStep('auth') && <AuthenticationStep />}
```

### Data-based
```tsx
{booking.summary && (
  <div>
    {/* Render summary */}
  </div>
)}

{booking.guestInfo && (
  <div>
    {/* Render guest info */}
  </div>
)}
```

## Best Practices

### ✅ Do's
- Use the booking store for all booking-related state
- Keep components focused on a single responsibility
- Import components from `@/components/booking`
- Use `parseISODateString()` for date parsing
- Handle errors gracefully
- Show loading states during async operations
- Validate user input before submission
- Clear errors after successful operations

### ❌ Don'ts
- Don't duplicate `parseISODateString()` in multiple files
- Don't mix booking logic with UI components
- Don't modify store state directly (use actions)
- Don't forget to handle loading/error states
- Don't create tight coupling between step components
- Don't skip form validation
- Don't hard-code URLs (use environment variables)

## Common Tasks

### Add a new form field
1. Add state: `const [field, setField] = useState('');`
2. Add to JSX with label, input, error
3. Add validation in `validateForm()`
4. Include in submission data

### Update pricing display
1. Modify `BookingSummary.tsx`
2. Ensure pricing data is in store
3. Update formatting/breakdown as needed

### Add a new step
1. Create component file
2. Export in index.ts
3. Add to main route render logic
4. Add to progress steps array
5. Update step navigation logic

### Fetch additional data
1. Use tRPC client in useEffect
2. Handle loading state
3. Handle errors
4. Update store or local state

## Debugging Tips

### Check store state
```tsx
console.log('Booking state:', booking);
console.log('Current step:', booking.currentStep);
console.log('Pricing:', booking.pricing);
```

### Check session
```tsx
console.log('Session:', session);
console.log('User:', session?.user);
```

### Check form validation
```tsx
console.log('Errors:', errors);
console.log('Form valid:', Object.keys(errors).length === 0);
```

### Monitor API calls
```tsx
console.log('Calling API with:', requestData);
const result = await trpcClient.endpoint.mutate(requestData);
console.log('API response:', result);
```

## Related Documentation

- See `BOOKING_REFACTOR_SUMMARY.md` for full refactoring details
- See `BOOKING_ARCHITECTURE.md` for architecture diagrams
- See main codebase for store implementation
