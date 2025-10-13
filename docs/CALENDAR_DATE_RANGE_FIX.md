# Calendar Date Range Fix - Checkout-Only Dates

## Issue
The `RoomAvailabilityCalendar` component was not correctly handling "checkout-only" dates. When bookings existed with specific date ranges, the calendar needed to support overlapping check-in/checkout dates.

### Examples:
1. **Oct 13-17 and Oct 17-20 bookings**: These work correctly because Oct 17 can be both a checkout date (for first booking) and check-in date (for second booking)
2. **Nov 22-23 booking**: Nov 22 is blocked (someone is staying), but it should be available as a **checkout-only** date for someone booking Nov 21-22

## Root Cause
The component was treating all blocked dates the same way, without distinguishing between:
- **Dates within a booking period**: Completely blocked (e.g., Nov 22 from a Nov 22-23 booking)
- **Check-in dates that can serve as checkout dates**: Should be selectable as checkout dates only

## Solution
Modified the `RoomAvailabilityCalendar.tsx` component to properly identify and handle checkout-only dates:

### 1. Identify Checkout-Only Dates
These are dates that are blocked because they're check-in dates for existing bookings. Since checkout happens in the morning and check-in happens in the afternoon, these dates can be used as checkout dates for new bookings.

```typescript
const findCheckoutOnlyDates = () => {
  const checkoutDates = new Set<string>();
  
  // Look through all blocked dates to find check-in dates
  for (let i = 0; i < calendar.length; i++) {
    const day = calendar[i];
    
    // If this date is blocked and has booking info
    if ((!day.available || day.blocked) && day.booking) {
      // The check-in date of this booking can be used as a checkout date
      const checkInDate = day.booking.checkInDate;
      checkoutDates.add(checkInDate);
    }
  }
  
  return Array.from(checkoutDates).map(dateStr => createDate(dateStr));
};
```

### 2. Visual Distinction
- **Available dates**: Green background - can check in
- **Checkout-only dates**: Orange background - can only be used as checkout date
- **Unavailable dates**: Red/strikethrough - completely blocked
- **Selected dates**: Blue background - current selection

### 3. Selection Logic
The `getDisabledDates` function now handles checkout-only dates intelligently:

```typescript
const getDisabledDates = (date: Date) => {
  // ... date validation ...
  
  if (!dayData.available || dayData.blocked) {
    // Check if this is a checkout-only date
    const isCheckoutOnly = dayData.booking && dayData.date === dayData.booking.checkInDate;
    
    // If selecting end date (already have start) and this is checkout-only, allow it
    if (dateRange?.from && !dateRange?.to && isCheckoutOnly) {
      return false; // Allow as checkout date
    }
    
    // Otherwise, disable all blocked dates
    return true;
  }
  
  return false;
};
```

### 4. Validation Logic (Already Correct)
The `handleDateRangeSelect` function already correctly validates ranges because it uses `current < end`, which excludes the checkout date from blocked date validation:

```typescript
// Check if any date in the stay period (excluding checkout day) is blocked
while (current < end) {
  const dateStr = `${current.getFullYear()}-...`;
  const dayData = availability.calendar.find(day => day.date === dateStr);
  
  if (dayData && (!dayData.available || dayData.blocked)) {
    return; // Reject selection
  }
  current.setDate(current.getDate() + 1);
}
```

This means:
- Booking Nov 21-22: Only checks Nov 21 (which is available)
- Nov 22 is the checkout date, so it's not validated for availability
- Even though Nov 22 is blocked (someone else checks in), it works as a checkout date

## Backend Changes
Updated `/src/integrations/trpc/availability.ts` to include booking information for external bookings (Airbnb, Expedia).

### Before
External bookings from `roomAvailability` didn't include booking details:
```typescript
dateMap.set(dateKey, {
  available: record.isAvailable ?? true,
  blocked: record.isBlocked ?? false,
  price: record.priceOverride || roomData.basePrice,
  source: record.source || undefined,
  // No booking info - frontend couldn't identify checkout-only dates
});
```

### After
External bookings now include booking details so frontend can identify checkout-only dates:
```typescript
dateMap.set(dateKey, {
  available: record.isAvailable ?? true,
  blocked: record.isBlocked ?? false,
  price: record.priceOverride || roomData.basePrice,
  source: record.source || undefined,
  // Include booking info for external bookings
  booking: {
    id: record.id,
    confirmationId: record.externalBookingId || record.id,
    checkInDate: record.checkInDate,
    checkOutDate: record.checkOutDate,
  },
});
```

This allows the frontend to identify check-in dates for both:
- **Direct bookings**: From the `bookings` table
- **External bookings**: From the `roomAvailability` table (Airbnb, Expedia)

## Backend Behavior - Date Range Processing
The backend correctly processes date ranges:

```typescript
// For a booking from Nov 22-23:
for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
  // Only marks Nov 22 as blocked (d < checkOut excludes Nov 23)
  dateMap.set(dateKey, {
    available: false,
    blocked: true,
    source: 'booking',
    booking: { checkInDate, checkOutDate, ... }
  });
}
```

The loop correctly marks:
- **Nov 22**: Blocked (someone is staying)
- **Nov 23**: Not blocked (checkout date, room becomes available)

## Use Cases

### Case 1: Back-to-Back Bookings (Same Day)
- **Booking A**: Oct 13-17 (checkout Oct 17)
- **Booking B**: Oct 17-20 (check-in Oct 17)
- **Result**: Oct 17 is blocked from Booking A, but it's also Booking B's check-in date, so it appears as "checkout-only" and someone could book Oct 16-17

### Case 2: One-Night Gap Booking
- **Booking A**: Nov 22-23 (checkout Nov 23)
- **Booking B**: Nov 23-25 (check-in Nov 23)  
- **New Booking**: User wants Nov 21-22
- **Result**: Nov 22 shows as "checkout-only" (orange), user can select Nov 21-22, which checks out on Nov 22 when Booking A checks in

### Case 3: Can't Check In on Checkout-Only
- **Booking A**: Nov 22-23
- **New Booking**: User tries to check in on Nov 22
- **Result**: Nov 22 is disabled for check-in (only available when selecting as checkout date)

## UI Changes

### Calendar Legend
- ✅ Available (green) - Can check in
- 🟧 Checkout Only (orange) - Can only use as checkout date
- ❌ Unavailable (red) - Completely blocked
- 🔵 Selected (blue) - Current selection

### Helper Text
Added explanation: *"Checkout Only" dates can only be selected as your checkout date (not check-in).*

## Testing Scenarios

1. **Test Nov 21-22 selection**:
   - Nov 22-23 booking exists
   - Nov 22 shows as orange (checkout-only)
   - Select Nov 21 (check-in)
   - Click Nov 22 (checkout) - should be allowed
   - Try to select Nov 22 as check-in - should be disabled

2. **Test Oct 16-17 selection**:
   - Oct 13-17 booking exists, Oct 17-20 booking exists
   - Oct 17 shows as orange (checkout-only)
   - Select Oct 16, then Oct 17 - should work

3. **Test invalid selection**:
   - Try to select Nov 21-23 when Nov 22-23 is booked
   - Should be rejected because Nov 22 is in the stay period

## Database Schema (Unchanged)
```typescript
export const roomAvailability = sqliteTable('room_availability', {
  checkInDate: text('check_in_date').notNull(), // YYYY-MM-DD
  checkOutDate: text('check_out_date'),         // YYYY-MM-DD
  isAvailable: integer('is_available', { mode: 'boolean' }),
  isBlocked: integer('is_blocked', { mode: 'boolean' }),
  source: text('source'), // direct, airbnb, expedia, manual
  // ... other fields
});
```

## Files Changed
- `/src/components/RoomAvailabilityCalendar.tsx` - Frontend calendar component
- `/src/integrations/trpc/availability.ts` - Backend API to include booking info for external bookings

## Date: October 13, 2025
