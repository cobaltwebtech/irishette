# Booking Component Architecture

## Component Hierarchy

```
booking.tsx (Main Route - 217 lines)
│
├── BookingFlow Component
│   ├── State Management (useBookingStore, useSession)
│   ├── Effects (hydration, room fetch, pricing, auth)
│   │
│   └── Render Tree:
│       ├── <BookingHeader />
│       │   └── Back navigation + room name
│       │
│       ├── <BookingProgressSteps />
│       │   └── 4-step progress indicator
│       │
│       └── Main Content Grid
│           ├── Left Column (2/3 width)
│           │   ├── <DatesStep /> (when step === 'dates')
│           │   ├── <AuthenticationStep /> (when step === 'auth')
│           │   ├── <BookingDetailsStep /> (when step === 'details')
│           │   └── <ConfirmationStep /> (when step === 'confirmation')
│           │
│           └── Right Column (1/3 width)
│               └── <BookingSummary />
│                   └── Sticky sidebar with pricing
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Booking Store (Zustand)                  │
│  • roomId, roomSlug, roomName                               │
│  • checkInDate, checkOutDate, guestCount                    │
│  • guestInfo, pricing                                       │
│  • currentStep, error                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ (shared state)
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Header  │    │   Steps  │    │ Summary  │
└──────────┘    └──────────┘    └──────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌────────┐    ┌──────────┐   ┌────────────┐
   │ Dates  │    │   Auth   │   │  Details   │
   └────────┘    └──────────┘   └────────────┘
                                       │
                                       ▼
                                 ┌────────────┐
                                 │  Payment   │
                                 └────────────┘
                                       │
                                       ▼
                                 ┌────────────┐
                                 │   Stripe   │
                                 └────────────┘
                                       │
                                       ▼
                                 ┌────────────┐
                                 │ Confirm    │
                                 └────────────┘
```

## Component Dependencies

```
types.ts
  └── parseISODateString()
      └── Used by:
          ├── BookingDetailsStep.tsx
          ├── ConfirmationStep.tsx
          └── BookingSummary.tsx

@/stores (useBookingStore)
  └── Used by:
      ├── BookingHeader.tsx
      ├── BookingProgressSteps.tsx
      ├── DatesStep.tsx
      ├── AuthenticationStep.tsx
      ├── BookingDetailsStep.tsx
      ├── ConfirmationStep.tsx
      └── BookingSummary.tsx

@/lib/auth-client (useSession, authClient)
  └── Used by:
      ├── BookingProgressSteps.tsx (session check)
      ├── AuthenticationStep.tsx (magic link)
      └── BookingDetailsStep.tsx (user data, updates)

@/integrations/tanstack-query/root-provider (trpcClient)
  └── Used by:
      ├── booking.tsx (room fetch, pricing)
      ├── BookingDetailsStep.tsx (pricing, booking creation)
      └── ConfirmationStep.tsx (booking details)
```

## Step Flow Logic

```
┌─────────────────────────────────────────────────────────────┐
│  User lands on /booking with booking data in store          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Check Store  │
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      No booking      Has booking     Has confirmed
            │               │               │
            ▼               ▼               ▼
    Show "No Active   Route to step:   Show confirmation
      Booking"        • dates            with booking ID
                      • auth
                      • details
                      • confirmation

Step Transitions:
  dates → auth → details → payment → confirmation
    ↑                         │
    └─────── (cancel) ────────┘
```

## Component Responsibilities

### 📋 **BookingHeader**
- Display current room name
- Provide back navigation
- Static display component

### 📊 **BookingProgressSteps**
- Visual progress indicator
- Show which step is active
- Mark completed steps
- Display component only

### 📅 **DatesStep**
- Fallback for missing dates
- Redirect to room selection
- Simple redirect component

### 🔐 **AuthenticationStep**
- Send magic link via email
- Show email sent confirmation
- Auto-advance when authenticated
- Handles 3 states: unauthenticated, sending, sent

### 📝 **BookingDetailsStep** (Most Complex)
- Collect guest information
- Validate form inputs
- Update user profile
- Calculate final pricing
- Create booking record
- Initiate Stripe payment
- Handle errors gracefully

### ✅ **ConfirmationStep**
- Fetch confirmation details
- Display booking summary
- Show confirmation ID
- Provide next steps
- Action buttons (new booking, home)

### 💰 **BookingSummary** (Sidebar)
- Display room info
- Show selected dates
- Pricing breakdown
- Tax details (state + city)
- Guest information
- Sticky positioning
- Visible on all steps

## State Management Pattern

```typescript
// All components follow this pattern:
const booking = useBookingStore();

// Read state
booking.roomId
booking.currentStep
booking.guestInfo
booking.pricing

// Update state
booking.actions.setStep('details')
booking.actions.setGuestInfo({ ... })
booking.actions.setPricing({ ... })
booking.actions.setError('...')

// Check state
booking.isStep('auth')
booking.hasActiveBooking()
booking.isValid.dates
```

## Key Features by Component

### BookingDetailsStep Features:
- ✅ Form validation (name, email, phone, guests)
- ✅ User profile updates (Better Auth + tRPC)
- ✅ Real-time pricing calculation
- ✅ Policy acceptance checkbox
- ✅ Special requests textarea
- ✅ Error handling and display
- ✅ Loading states during payment
- ✅ Stripe checkout integration

### BookingSummary Features:
- ✅ Sticky sidebar (follows scroll)
- ✅ Room and date display
- ✅ Per-night pricing
- ✅ Subtotal calculation
- ✅ Service fees
- ✅ Tax breakdown (state + city)
- ✅ Total amount
- ✅ Guest info display
- ✅ "Estimated" badge before payment

### ConfirmationStep Features:
- ✅ Success message
- ✅ Confirmation ID display
- ✅ Full booking details
- ✅ Payment summary
- ✅ Guest information
- ✅ Next steps instructions
- ✅ Action buttons
- ✅ Loading state for confirmation ID

## Testing Strategy (Future)

```
Unit Tests:
  ├── BookingHeader.test.tsx
  ├── BookingProgressSteps.test.tsx
  ├── DatesStep.test.tsx
  ├── AuthenticationStep.test.tsx
  ├── BookingDetailsStep.test.tsx
  ├── ConfirmationStep.test.tsx
  ├── BookingSummary.test.tsx
  └── types.test.ts

Integration Tests:
  └── booking-flow.test.tsx
      ├── Complete booking flow
      ├── Error handling
      ├── State persistence
      └── Payment integration

E2E Tests:
  └── booking.spec.ts
      ├── Full user journey
      ├── Stripe test mode
      └── Email verification
```

## Performance Considerations

- ✅ **Lazy Loading**: Could split large components
- ✅ **Memoization**: Consider React.memo for static components
- ✅ **Debouncing**: Form inputs could be debounced
- ✅ **Code Splitting**: Dynamic imports for steps
- ✅ **Bundle Size**: Each component is independently bundled
- ✅ **Render Optimization**: Minimal re-renders due to store slicing

## Future Enhancements

1. **Custom Hooks**
   ```typescript
   useBookingForm()
   usePaymentProcessor()
   useBookingValidation()
   ```

2. **Error Boundaries**
   - Wrap each step in error boundary
   - Graceful degradation
   - Error reporting

3. **Analytics**
   - Track step completions
   - Monitor drop-off rates
   - Payment success rates

4. **Accessibility**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

5. **Internationalization**
   - Multi-language support
   - Currency conversion
   - Date format localization
