# User Profile Edit Feature

## Overview
This document describes the user profile editing feature that allows authenticated users to update their personal information (name, email, and phone number) from their account dashboard.

## Implementation Date
October 19, 2025

## Architecture

### Components

#### 1. EditProfileModal Component
**Location:** `/src/components/EditProfileModal.tsx`

A reusable modal dialog component that provides a form for editing user profile information.

**Features:**
- Form validation for all fields
- Real-time error display
- Loading states during submission
- Integration with Better Auth and tRPC
- Toast notifications for success/error states

**Props:**
```typescript
interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string | null;
  };
}
```

**Validation Rules:**
- **Name**: Required, minimum 1 character
- **Email**: Required, must be valid email format
- **Phone Number**: Optional, minimum 10 digits if provided

**Dependencies:**
- Shadcn UI Dialog component
- TanStack Query for mutations
- Better Auth's `updateUser` function
- tRPC `users.updateProfile` mutation
- Sonner for toast notifications

#### 2. Account Page Integration
**Location:** `/src/routes/account/index.tsx`

Updated to include the EditProfileModal component with a trigger button.

**Changes:**
- Added state management for modal open/close: `isEditModalOpen`
- Added "Edit your information" button that opens modal
- Integrated EditProfileModal component
- Passed current user data to modal

### Backend

#### tRPC Router Updates
**Location:** `/src/integrations/trpc/users.ts`

Added new `updateProfile` mutation to the users router.

**Mutation Details:**
```typescript
updateProfile: publicProcedure
  .input(z.object({
    userId: z.string(),
    name: z.string().min(1, 'Name is required').optional(),
    email: z.string().email('Invalid email address').optional(),
    phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits').optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Updates user in database
  })
```

**Functionality:**
- Accepts user ID and optional name, email, and phoneNumber fields
- Only updates fields that are provided
- Sets `updatedAt` timestamp automatically
- Returns success/error response

### Authentication Integration

#### Better Auth
The feature uses Better Auth's `updateUser` function for updating the session with the new name. This ensures:
- Session is updated immediately
- User sees changes without re-login
- Name changes are reflected across the app

#### Session Refresh
After successful profile update:
1. tRPC mutation updates database
2. Better Auth `updateUser` updates session (for name changes)
3. Query invalidation triggers session refresh
4. UI updates automatically with new data

## User Flow

### 1. Opening the Edit Modal
- User navigates to `/account`
- User clicks "Edit your information" button in Quick Actions card
- Modal opens with pre-populated current user data

### 2. Editing Information
- User can modify name, email, and/or phone number
- Real-time validation on input changes
- Error messages display below invalid fields
- Form submission disabled while loading

### 3. Saving Changes
- User clicks "Save Changes" button
- Form validation runs
- If valid:
  - tRPC mutation updates database
  - Better Auth updates session (name only)
  - Success toast notification displays
  - Modal closes automatically
  - Account page refreshes with new data
- If invalid:
  - Error messages display
  - Modal remains open
  - User can correct and retry

### 4. Canceling Changes
- User clicks "Cancel" button
- Modal closes without saving
- Form resets to original values

## Data Flow

```
User Input → Form Validation → tRPC Mutation (Database) → Better Auth Update (Session) → Query Invalidation → UI Refresh
```

### Detailed Steps:

1. **User Input**: User modifies fields in EditProfileModal
2. **Client-Side Validation**: 
   - Name: Required, min 1 char
   - Email: Required, valid email format
   - Phone: Optional, min 10 digits
3. **Database Update** (via tRPC):
   - POST to `/api/trpc/users.updateProfile`
   - Updates `user` table in Cloudflare D1
   - Sets `updatedAt` timestamp
4. **Session Update** (via Better Auth):
   - Calls `updateUser({ name })` for name changes
   - Updates Better Auth session
5. **Cache Invalidation**:
   - Invalidates `['session']` query
   - Forces refetch of user data
6. **UI Update**:
   - Account page re-renders
   - New data displays in Account Information card
   - Phone number updates in display

## Error Handling

### Client-Side Errors
- **Validation Errors**: Display inline below each field
- **Network Errors**: Toast notification with generic error message
- **Form State**: Button disabled during submission

### Server-Side Errors
- **Database Errors**: Caught and logged, user sees generic error toast
- **Validation Errors**: Passed back to client, displayed in toast
- **Authentication Errors**: tRPC handles via middleware

## Styling

### Modal Design
- Max width: 425px (responsive)
- Shadcn Dialog component styling
- Form fields with proper spacing
- Error states: Red border + red text
- Loading states: Spinner icon in button

### Button States
- **Default**: Primary color, enabled
- **Loading**: Disabled with spinner
- **Disabled**: Grayed out

## Security Considerations

### Authentication
- User must be logged in to access account page
- User ID from session used for updates (not from client input)
- Better Auth handles session management

### Validation
- Client-side validation for UX
- Server-side validation in tRPC mutation (defense in depth)
- Email format validation
- Phone number minimum length check

### Data Integrity
- Only updates fields that are provided
- Sets `updatedAt` timestamp for audit trail
- Preserves existing data if not changed

## Future Enhancements

### Potential Improvements
1. **Email Verification**: Send verification email when email changes
2. **Phone Verification**: Add SMS verification for phone number changes
3. **Password Change**: Add password update to same modal or separate form
4. **Profile Picture**: Allow user to upload and manage avatar
5. **Two-Factor Auth**: Enable 2FA setup from profile settings
6. **Audit Log**: Show history of profile changes
7. **Cancel Confirmation**: Add confirmation dialog when closing with unsaved changes
8. **Auto-Save**: Debounced auto-save functionality
9. **Field-Level Permissions**: Admin control over which fields users can edit

### Known Limitations
1. Email changes don't trigger verification flow (uses existing Better Auth email)
2. Phone number verification not implemented (planned for future)
3. No profile picture support yet
4. No change history/audit log
5. Session refresh requires manual query invalidation (not real-time)

## Testing Considerations

### Manual Testing Checklist
- [ ] Modal opens when clicking "Edit your information"
- [ ] Modal displays current user data
- [ ] Name field validation (required)
- [ ] Email field validation (required, valid format)
- [ ] Phone field validation (optional, min 10 digits)
- [ ] Save button disabled during submission
- [ ] Success toast on successful save
- [ ] Error toast on failed save
- [ ] Modal closes after successful save
- [ ] Account page refreshes with new data
- [ ] Cancel button closes modal without saving
- [ ] Form resets when reopening modal

### Edge Cases
- [ ] Empty name field
- [ ] Invalid email format
- [ ] Phone number with non-digits
- [ ] Very long name/email/phone
- [ ] Network failure during save
- [ ] Session expiration during edit
- [ ] Rapid clicking of save button
- [ ] Closing modal during submission

## Related Files

### Components
- `/src/components/EditProfileModal.tsx` - Main modal component
- `/src/components/ui/dialog.tsx` - Shadcn Dialog component
- `/src/components/ui/input.tsx` - Shadcn Input component
- `/src/components/ui/label.tsx` - Shadcn Label component
- `/src/components/ui/button.tsx` - Shadcn Button component

### Routes
- `/src/routes/account/index.tsx` - Account dashboard page

### Backend
- `/src/integrations/trpc/users.ts` - tRPC users router
- `/src/db/auth-schema.ts` - Database schema
- `/src/lib/auth.ts` - Better Auth server config
- `/src/lib/auth-client.ts` - Better Auth client config

### Types
- `/src/lib/auth-types.ts` - Extended user types

## Troubleshooting

### Modal Doesn't Open
- Check if `isEditModalOpen` state is being set
- Verify button onClick handler
- Check for JavaScript errors in console

### Changes Not Saving
- Check network tab for tRPC request
- Verify user is authenticated
- Check database connection
- Review server logs for errors

### UI Not Updating After Save
- Verify query invalidation is working
- Check if session is refreshing
- Force reload to see if data persisted

### Validation Errors
- Check console for validation error details
- Verify input format matches requirements
- Ensure server-side validation aligns with client-side

## Conclusion

This feature provides a seamless user experience for profile management while maintaining security and data integrity. The implementation leverages existing Better Auth and tRPC infrastructure, making it maintainable and consistent with the rest of the application.
