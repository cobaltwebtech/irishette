# Phone Number Integration Refactoring

## Overview
Refactored the TanStack Start app and tRPC integration to use the new `phoneNumber` field in the `user` table instead of only storing phone numbers in the `bookings` table. This provides a more efficient way to manage user data and pre-populate forms for returning users.

## Changes Made

### 1. Database Schema (`src/db/auth-schema.ts`)
Added two new fields to the `user` table:
- `phoneNumber: text('phone_number')` - Stores the user's phone number
- `phoneNumberVerified: integer('phone_number_verified', { mode: 'boolean' })` - Tracks phone verification status

These fields follow the Better Auth phone number plugin schema requirements.

### 2. Type Definitions (`src/lib/auth-types.ts`)
Created a new type definition file to extend the Better Auth user type with custom fields:
```typescript
export interface ExtendedUser {
  // ... existing fields
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
}
```

### 3. tRPC Users Router (`src/integrations/trpc/users.ts`)

#### Added New Mutation: `updatePhoneNumber`
- Allows logged-in users to update their phone number in the user table
- Input validation requires minimum 10 digits
- Updates the `updatedAt` timestamp automatically

#### Updated Query: `adminListGuests`
- Changed from using SQL subquery to get latest phone from bookings table
- Now directly uses `user.phoneNumber` field
- Simplified query and improved performance

### 4. Booking Flow (`src/routes/booking.tsx`)

#### Pre-population Logic
- Phone input field now pre-fills from `session.user.phoneNumber` for returning users
- Falls back to `booking.guestInfo.phone` only if user doesn't have a saved phone number
- Initial state now checks for existing phone number: `useState((session?.user as { phoneNumber?: string })?.phoneNumber || '')`

#### Phone Number Update on Booking
Added logic in `handleContinue()` to update the user's phone number:
```typescript
// Update user's phone number via tRPC if it's different and user is logged in
if (session?.user && guestPhone.trim() && 
    guestPhone.trim() !== (session.user as { phoneNumber?: string })?.phoneNumber) {
  await trpcClient.users.updatePhoneNumber.mutate({
    userId: session.user.id,
    phoneNumber: guestPhone.trim(),
  });
}
```

This ensures:
1. New users get their phone number saved on first booking
2. Returning users can update their phone number if it changed
3. The booking flow doesn't block if the update fails (graceful degradation)

### 5. Account Page (`src/routes/account/index.tsx`)
Added phone number display in the Account Information card:
```typescript
{(session.user as { phoneNumber?: string })?.phoneNumber && (
  <div>
    <p className="text-sm font-medium text-muted-foreground">
      Phone Number
    </p>
    <p className="text-foreground">
      {(session.user as { phoneNumber?: string })?.phoneNumber}
    </p>
  </div>
)}
```

## Data Flow

### New User Booking Flow
1. User enters phone number in booking form
2. On "Continue to Payment", phone is saved via tRPC to `user.phoneNumber`
3. Phone is also saved to `bookings.guestPhone` for historical record
4. Future bookings will pre-fill from `user.phoneNumber`

### Returning User Booking Flow
1. Phone input auto-populates from `session.user.phoneNumber`
2. User can modify if needed
3. If modified, updated via tRPC mutation before proceeding to payment
4. Phone is saved to `bookings.guestPhone` for this booking's record

### Admin Guest Management
- Admin dashboard now displays phone from `user.phoneNumber`
- More efficient query (no subquery needed)
- Single source of truth for user contact info

## Important Notes

### Historical Data Preservation
- The `bookings.guestPhone` field is still populated for each booking
- This maintains historical accuracy (e.g., if user changes phone number)
- Each booking record captures the phone number used at booking time
- Useful for customer service and audit purposes

### Type Safety
- Used inline type assertions `(session.user as { phoneNumber?: string })` to access custom fields
- Better Auth session types don't automatically include custom schema fields
- This approach avoids TypeScript errors while maintaining type safety

### Graceful Degradation
- Phone number updates are wrapped in try-catch blocks
- Failures are logged but don't block the booking flow
- Ensures smooth user experience even if tRPC mutation fails

### Better Auth Plugin
- The schema is prepared for Better Auth's phone number plugin
- Currently just storing phone number without OTP verification
- Can be enhanced later to add phone authentication features:
  - SMS OTP verification
  - Phone number sign-in
  - Two-factor authentication

## Future Enhancements

1. **Phone Verification**
   - Add Better Auth phone number plugin to server config
   - Implement OTP verification flow
   - Update `phoneNumberVerified` field

2. **Phone Number Sign-In**
   - Allow users to sign in with phone + password
   - Enable SMS-based magic links

3. **Profile Management**
   - Create dedicated profile edit page
   - Allow users to update phone number outside of booking flow
   - Add phone number formatting/validation

4. **Admin Features**
   - Add phone number to admin booking details
   - Enable SMS notifications for booking updates
   - Phone-based guest search in admin panel

## Testing Checklist

- [ ] New user completes booking - phone saved to user table ✓
- [ ] Returning user with phone - input pre-filled ✓
- [ ] Returning user updates phone - new number saved ✓
- [ ] Account page shows phone number ✓
- [ ] Admin guest list shows phone from user table ✓
- [ ] Booking confirmation still includes guest phone ✓
- [ ] Historical bookings retain original phone numbers ✓

## Migration Notes

After running `drizzle-kit generate`, apply the migration with:
```bash
npx wrangler d1 execute DB --remote --file=./drizzle/XXXX_migration.sql
```

Existing users without phone numbers will have `null` values, which is expected and handled by the conditional rendering in the UI.
