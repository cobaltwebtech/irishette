# Calendar Checkout-Only Dates - Testing Guide

## Overview
This guide explains how to test the checkout-only date functionality for both direct bookings and external bookings (Airbnb, Expedia).

## Test Data Setup

### Direct Booking (Bookings Table)
```sql
-- Example: Oct 13-17, 2025
INSERT INTO bookings (
  id, room_id, check_in_date, check_out_date, status, ...
) VALUES (
  'booking-1', 'room-1', '2025-10-13', '2025-10-17', 'confirmed', ...
);
```

### External Booking (Room Availability Table)
```sql
-- Example: Nov 22-23, 2025 (Expedia)
INSERT INTO room_availability (
  id, room_id, check_in_date, check_out_date, 
  is_available, is_blocked, source, external_booking_id
) VALUES (
  'avail-1', 'room-1', '2025-11-22', '2025-11-23',
  false, true, 'expedia', 'EXP-12345'
);
```

## Test Scenarios

### Scenario 1: Direct Booking - Nov 22-23
**Setup**: Create a direct booking from Nov 22-23 in the `bookings` table

**Expected Behavior**:
- ✅ Nov 22 displays as **Checkout Only** (orange)
- ✅ Nov 21 is available for selection (green)
- ✅ Can select Nov 21 as check-in
- ✅ Can then select Nov 22 as checkout
- ❌ Cannot select Nov 22 as check-in (disabled when no range selected)

**Test Steps**:
1. Open the calendar for the room
2. Verify Nov 22 shows in orange with "Checkout Only" label
3. Click Nov 21 → should select as check-in date
4. Click Nov 22 → should select as checkout date
5. Verify the range "Nov 21 - Nov 22" is selected
6. Clear selection
7. Try clicking Nov 22 first → should be disabled

### Scenario 2: External Booking (Expedia) - Nov 22-23
**Setup**: Create an Expedia booking from Nov 22-23 in the `room_availability` table

**Expected Behavior**:
- ✅ Nov 22 displays as **Checkout Only** (orange)
- ✅ Nov 21 is available for selection (green)
- ✅ Can book Nov 21-22 (overlapping with Expedia check-in)
- ❌ Cannot check in on Nov 22

**Test Steps**:
1. Open the calendar
2. Verify Nov 22 shows as orange (checkout-only)
3. Select Nov 21 → Nov 22
4. Should successfully create the selection
5. Backend should accept this booking

### Scenario 3: External Booking (Airbnb) - Oct 17-20
**Setup**: Create Airbnb booking Oct 17-20

**Expected Behavior**:
- ✅ Oct 17 displays as **Checkout Only** (orange)
- ✅ Can book Oct 16-17
- ✅ Oct 18, 19 show as **Unavailable** (red)
- ✅ Oct 20 shows as **Available** (green, can check in)

### Scenario 4: Back-to-Back Bookings
**Setup**: 
- Direct booking: Oct 13-17
- Expedia booking: Oct 17-20

**Expected Behavior**:
- ✅ Oct 13, 14, 15, 16 show as **Unavailable** (red)
- ✅ Oct 17 shows as **Checkout Only** (orange) - even though it's blocked from first booking
- ✅ Oct 18, 19 show as **Unavailable** (red)
- ✅ Oct 20 shows as **Available** (green)
- ✅ Someone can still book Oct 16-17 (checking out when second booking checks in)

### Scenario 5: One-Night Stay
**Setup**: Expedia booking Nov 22-23 (single night)

**Expected Behavior**:
- ✅ Nov 21 **Available** (green)
- ✅ Nov 22 **Checkout Only** (orange)
- ✅ Nov 23 **Available** (green)
- ✅ Can book Nov 21-22 (checks out Nov 22)
- ✅ Can book Nov 23-24 (checks in Nov 23)
- ❌ Cannot book Nov 22-23 (Nov 22 disabled for check-in)

## Visual Verification

### Color Coding
- **Green** (Available): `bg-secondary hover:bg-secondary/80 border-primary/20`
- **Orange** (Checkout Only): `bg-orange-100 text-orange-900 border-orange-300`
- **Red** (Unavailable): `bg-destructive/20 text-destructive line-through opacity-75`
- **Blue** (Selected): `bg-primary text-primary-foreground hover:bg-primary/90`

### Legend Display
The calendar should show:
- ✅ Available (green box)
- 🟧 Checkout Only (orange box)
- ❌ Unavailable (red box)
- 🔵 Selected (blue box)

### Helper Text
Should display: *"Checkout Only" dates can only be selected as your checkout date (not check-in).*

## Backend Validation

### API Response Check
The `getBySlug` endpoint should return:

```json
{
  "calendar": [
    {
      "date": "2025-11-22",
      "available": false,
      "blocked": true,
      "price": 100,
      "source": "expedia",
      "booking": {
        "id": "avail-1",
        "confirmationId": "EXP-12345",
        "checkInDate": "2025-11-22",
        "checkOutDate": "2025-11-23"
      }
    },
    {
      "date": "2025-11-23",
      "available": true,
      "blocked": false,
      "price": 100,
      "source": null,
      "booking": null
    }
  ]
}
```

Key points:
- ✅ Nov 22 has `booking` object (even for external bookings)
- ✅ Nov 22 has `checkInDate` and `checkOutDate`
- ✅ Nov 23 is NOT blocked (available for check-in)

## Common Issues

### Issue: External booking dates not showing as checkout-only
**Cause**: Backend not including `booking` object for `roomAvailability` records  
**Solution**: Verify the backend change was applied to include booking info

### Issue: Direct bookings work but external don't
**Cause**: `roomAvailability` table might not have `checkOutDate` populated  
**Solution**: Ensure iCal sync populates both `checkInDate` and `checkOutDate`

### Issue: Can't select any blocked dates
**Cause**: `getDisabledDates` function not checking if range start is selected  
**Solution**: Verify the logic checks `dateRange?.from && !dateRange?.to`

## Browser Console Testing

### Check Calendar Data
```javascript
// In browser console, after calendar loads
console.log('Calendar data:', availabilityQuery.data?.calendar);

// Find checkout-only dates
const checkoutOnly = availabilityQuery.data?.calendar.filter(day => 
  (!day.available || day.blocked) && 
  day.booking && 
  day.date === day.booking.checkInDate
);
console.log('Checkout-only dates:', checkoutOnly);
```

### Check Date Selection
```javascript
// After selecting dates
console.log('Selected range:', dateRange);
console.log('From:', dateRange?.from);
console.log('To:', dateRange?.to);
```

## Success Criteria

All of the following must be true:
- ✅ Direct bookings show checkout-only dates correctly
- ✅ External bookings (Airbnb, Expedia) show checkout-only dates correctly
- ✅ Can book ending on a checkout-only date
- ✅ Cannot book starting on a checkout-only date
- ✅ Visual indicators (colors) are correct
- ✅ Legend explains all date types
- ✅ Helper text is displayed
- ✅ Validation allows valid bookings
- ✅ Validation rejects invalid bookings

## Date: October 13, 2025
