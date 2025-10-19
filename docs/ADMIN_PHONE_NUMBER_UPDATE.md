# Admin Dashboard Phone Number Update

## Overview
Updated the admin guest management pages to display phone numbers from the `user` table instead of querying from the `bookings` table. This provides a consistent single source of truth for user contact information across the application.

## Changes Made

### 1. Admin Guest List Page (`src/routes/admin/guest/index.tsx`)

#### Updated Type Definition
Changed the `GuestData` type to reflect the actual tRPC response structure:

**Before:**
```typescript
type GuestData = {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    stripeCustomerId: string | null;
  };
  bookingCount: number;
  latestPhone: string | null;  // ❌ This was from a SQL subquery
};
```

**After:**
```typescript
type GuestData = {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    stripeCustomerId: string | null;
    phoneNumber: string | null;  // ✅ From user table
  };
  bookingCount: number;
};
```

#### Updated Phone Column Accessor
Changed the table column to access `user.phoneNumber` instead of `latestPhone`:

**Before:**
```typescript
columnHelper.accessor('latestPhone', { ... })
```

**After:**
```typescript
columnHelper.accessor('user.phoneNumber', { ... })
```

### 2. Admin Guest Detail Page (`src/routes/admin/guest/$userId.tsx`)

#### Updated Phone Number Display
Changed the phone number source from the first booking's `guestPhone` to the user's `phoneNumber`:

**Before:**
```typescript
{bookings[0]?.guestPhone && (
  <div>
    <p className="text-sm font-medium text-muted-foreground">Phone</p>
    <a href={`tel:${bookings[0].guestPhone}`}>
      <Phone className="w-4 h-4 inline mr-1" />
      {bookings[0].guestPhone}
    </a>
  </div>
)}
```

**After:**
```typescript
{(user as { phoneNumber?: string })?.phoneNumber && (
  <div>
    <p className="text-sm font-medium text-muted-foreground">Phone</p>
    <a href={`tel:${(user as { phoneNumber?: string })?.phoneNumber}`}>
      <Phone className="w-4 h-4 inline mr-1" />
      {(user as { phoneNumber?: string })?.phoneNumber}
    </a>
  </div>
)}
```

### 3. Backend (Already Configured)
The tRPC `usersRouter` in `src/integrations/trpc/users.ts` was already updated to include `phoneNumber` from the user table:

```typescript
const guests = await db
  .select({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      stripeCustomerId: user.stripeCustomerId,
      phoneNumber: user.phoneNumber, // ✅ Already included
    },
    bookingCount: count(bookings.id),
  })
  // ...
```

## Benefits

### 1. Single Source of Truth
- Phone numbers are now stored and retrieved from one place: `user.phoneNumber`
- No need for SQL subqueries to find the "latest" phone from bookings
- Consistent data across all admin views

### 2. Improved Performance
- Eliminated SQL subquery in `adminListGuests`
- Direct field access instead of aggregation
- Faster page loads for guest management

### 3. Data Consistency
- User's current phone number always displayed
- Historical booking phone numbers preserved in `bookings.guestPhone`
- Clear separation between current contact info and historical records

### 4. Better User Experience
- Admins see the user's most up-to-date phone number
- Clicking phone number initiates a call using `tel:` protocol
- Graceful handling when phone number is not available (shows "N/A")

## Data Flow

### Admin Guest List View
```
Database (user table)
  └─> user.phoneNumber
      └─> tRPC: adminListGuests
          └─> Frontend: GuestData type
              └─> Table column: user.phoneNumber
```

### Admin Guest Detail View
```
Database (user table)
  └─> user.phoneNumber
      └─> tRPC: adminGetGuestDetails
          └─> Frontend: user object
              └─> Display: (user as { phoneNumber?: string })?.phoneNumber
```

## Type Safety Notes

### Why Use Type Assertion?
The type assertion `(user as { phoneNumber?: string })` is used because:
1. The user type from the database doesn't automatically include custom fields in TypeScript
2. Better Auth's base user type doesn't know about custom schema fields
3. This is a safe approach since we control the tRPC query and know the field exists

### Alternative Approach (Future Enhancement)
Could create a custom type definition:
```typescript
type UserWithPhone = {
  phoneNumber?: string | null;
  // ... other fields
};
```

## Testing Checklist

### Admin Guest List Page
- [ ] Phone numbers display correctly in the table
- [ ] "N/A" shows for guests without phone numbers
- [ ] Phone numbers are clickable (`tel:` links work)
- [ ] Search/filter functionality works with phone numbers
- [ ] Sorting works correctly

### Admin Guest Detail Page
- [ ] User's current phone number displays in contact card
- [ ] Phone number is clickable
- [ ] Page doesn't break if user has no phone number
- [ ] Phone icon displays correctly
- [ ] Historical bookings still show their booking-specific phone numbers

### Data Integrity
- [ ] Phone numbers match between list and detail views
- [ ] Updates to user phone number (via booking) reflect in admin views
- [ ] Historical booking phone numbers remain unchanged in booking records

## Historical Data

### Important Note
- The `bookings.guestPhone` field is still preserved for each booking
- This maintains an audit trail of what phone number was used at booking time
- Admin can see historical phone numbers by viewing individual booking details
- Current phone number (user.phoneNumber) may differ from historical booking phones

## Future Enhancements

1. **Phone Number Formatting**
   - Add phone number formatting library (e.g., libphonenumber-js)
   - Display numbers in consistent format: (555) 123-4567

2. **Phone Number Validation**
   - Add visual indicator for invalid phone numbers
   - Admin tool to fix/validate phone numbers

3. **Communication History**
   - Track when phone numbers were updated
   - Show phone number change history

4. **Bulk Actions**
   - Export guest list with phone numbers
   - SMS notification capabilities (future feature)

## Related Files

- `/src/integrations/trpc/users.ts` - Backend queries
- `/src/routes/admin/guest/index.tsx` - Guest list page
- `/src/routes/admin/guest/$userId.tsx` - Guest detail page
- `/src/db/auth-schema.ts` - Database schema with phoneNumber field
- `/docs/PHONE_NUMBER_REFACTORING.md` - Main refactoring documentation
