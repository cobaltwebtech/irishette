# Implementation Changelog - 2025-11-06

This document consolidates all implementation changes made today that are not directly related to useEffect optimizations.

---

## Table of Contents

1. [Authentication Error Handling](#authentication-error-handling)
2. [Admin Route Error Handling](#admin-route-error-handling)

---

#### 1. Integrated into Root Layout
**File:** `src/routes/__root.tsx`

- Added `<ScrollRestoration />` component inside `<ReactLenis root>` wrapper
- Ensures scroll restoration is active for all routes
- Placed before Header to initialize early in the render tree

#### 2. Removed Redundant useEffect Calls
Removed scroll-to-top `useEffect` hooks from **6 route components**:

1. ✅ `src/routes/cancellation-refund-policy.tsx`
2. ✅ `src/routes/contact.tsx`
3. ✅ `src/routes/privacy-policy.tsx`
4. ✅ `src/routes/rooms/rose-room.tsx`
5. ✅ `src/routes/rooms/texas-room.tsx`
6. ✅ `src/routes/terms-of-service.tsx`

**Before (removed):**
```tsx
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}, []);
```

**After:**
```tsx
// Removed - now handled globally by ScrollRestoration component
```

### Benefits

**Code Quality:**
- **Reduced duplication:** Eliminated 6 identical `useEffect` implementations
- **Centralized logic:** Single source of truth for scroll restoration behavior
- **Cleaner components:** Route components focus on their core functionality

**Performance:**
- **Consistent behavior:** All routes now use the same scroll restoration strategy
- **Lenis integration:** Scroll animations respect the global Lenis configuration
- **Fewer subscriptions:** One router subscription instead of multiple effect subscriptions

**Maintainability:**
- **Single point of change:** Scroll behavior can be modified in one place
- **Type-safe:** Uses TanStack Router's typed subscription API
- **Framework-aligned:** Follows TanStack Router best practices

### Intentional Scroll Behaviors Preserved

The following scroll behaviors were **NOT** removed as they serve different purposes:

1. **Header "Irishette" logo click** (`src/components/Header.tsx`)
   - User-initiated scroll to top while staying on same page

2. **Homepage "Back to Top" buttons** (`src/routes/index.tsx`)
   - Two instances in FAQ and Testimonials sections
   - User-initiated scroll to top from page sections

3. **Booking flow scroll** (`src/routes/booking.tsx`)
   - Ensures users see the top of each booking step
   - Within-page navigation, not route changes

### Impact Metrics
- **useEffect calls removed:** 6
- **Lines of code removed:** ~36
- **Files modified:** 8 total (1 new, 1 updated, 6 cleaned up)

---

## Authentication Error Handling

### Overview
Fixed error handling for expired/invalid magic links and password reset tokens. Better Auth error parameters were nested inside the `redirect` URL parameter, not at the top level.

**Important Discovery:** Signup verification errors are redirected to `/login` by Better Auth, not back to `/signup`, so no error handling is needed on the signup route.

### Problem

#### URL Structure from Better Auth
When a magic link expires or is invalid, Better Auth redirects with this URL structure:

```
http://localhost:3000/auth/login?redirect=%2Faccount%3Ferror%3DINVALID_TOKEN
```

**Decoded:**
```
http://localhost:3000/auth/login?redirect=/account?error=INVALID_TOKEN
```

The error code is **nested inside the redirect parameter**, not a top-level query param.

#### Old Implementation (Broken)
```tsx
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error'); // Only checks ?error=...
  if (errorParam) {
    setError(errorParam);
    toast.error(errorParam); // Raw error codes
  }
}, []);
```

**Issues:**
- Only checked for top-level `?error=` parameter
- Didn't parse nested errors inside redirect URL
- Showed raw error codes without user-friendly messages

### Solution Implemented

#### 1. Updated Route Search Validation
**Files:** `src/routes/auth/login.tsx`, `src/routes/auth/reset-password.tsx`

```tsx
validateSearch: (search: Record<string, unknown>) => {
  return {
    redirect: (search.redirect as string) || undefined,
    error: (search.error as string) || undefined, // Support both patterns
  };
},
```

Supports both:
- Top-level: `?error=INVALID_TOKEN`
- Nested: `?redirect=/account?error=INVALID_TOKEN`

#### 2. Added Error Message Mapping

```tsx
const getErrorMessage = (errorCode: string): string => {
  const errorMessages: Record<string, string> = {
    INVALID_TOKEN: 'This magic link has expired or is invalid. Please request a new one.',
    EXPIRED_TOKEN: 'This magic link has expired. Please request a new one.',
    TOKEN_NOT_FOUND: 'Invalid magic link. Please request a new one.',
    INVALID_EMAIL: 'The email address is invalid. Please try again.',
    USER_NOT_FOUND: 'No account found with this email address.',
    INVALID_CREDENTIALS: 'Invalid email or password.',
  };
  return errorMessages[errorCode] || `Authentication error: ${errorCode}`;
};
```

**Benefits:**
- User-friendly error messages
- Covers common Better Auth error codes
- Fallback for unknown errors

#### 3. Used useEffectEvent for Stable Callbacks

```tsx
const showErrorToast = useEffectEvent((errorCode: string) => {
  const message = getErrorMessage(errorCode);
  setError(message);
  toast.error(message, {
    duration: 6000,
    description: 'Please try logging in again.',
  });
});
```

**Why useEffectEvent:**
- Callback doesn't need to be in effect dependencies
- Always has latest state/props
- Won't trigger effect re-runs

#### 4. Improved URL Parameter Parsing

```tsx
useEffect(() => {
  // Check top-level error param first
  if (search.error) {
    showErrorToast(search.error);
    return;
  }

  // Check if error is nested in the redirect URL
  if (search.redirect?.includes('?error=')) {
    try {
      const redirectUrl = new URL(search.redirect, window.location.origin);
      const errorParam = redirectUrl.searchParams.get('error');

      if (errorParam) {
        showErrorToast(errorParam);

        // Clean up the redirect URL by removing the error param
        redirectUrl.searchParams.delete('error');
        const cleanRedirect = redirectUrl.pathname +
          (redirectUrl.search ? redirectUrl.search : '');

        // Update URL to remove error and clean redirect
        router.navigate({
          to: '/auth/login',
          search: { redirect: cleanRedirect, error: undefined },
          replace: true,
        });
      }
    } catch (err) {
      console.error('Failed to parse redirect URL for error:', err);
    }
  }
}, [search.error, search.redirect, router]);
```

**Features:**
1. ✅ Checks top-level error first
2. ✅ Parses nested errors from redirect URL
3. ✅ Cleans up the URL after showing error
4. ✅ Removes error param from redirect destination
5. ✅ Handles parsing errors gracefully

### Better Auth Error Flow

#### Signup vs Login Error Handling

**Important:** Better Auth handles signup verification errors differently:

1. **User signs up** → Receives verification email
2. **Clicks expired/invalid link** → Better Auth redirects to `/login?error=INVALID_TOKEN` (NOT `/signup`)
3. **Login route handles the error** → Shows user-friendly message

**Why no error handling on signup route:**
- Signup only sends the initial verification email
- If verification fails, Better Auth redirects to `/login` with error params
- The login route already handles all verification token errors
- This prevents duplicate error handling code

#### Error Flow Diagram

```
┌─────────────┐
│   Signup    │ → User signs up → Email sent with verification link
└─────────────┘
       ↓
┌─────────────────────────────────────────────────────┐
│  User clicks link in email                          │
├─────────────────────────────────────────────────────┤
│  ✅ Valid token   → Redirects to /account (success) │
│  ❌ Invalid token → Redirects to /login?error=...   │  ← NOT /signup!
└─────────────────────────────────────────────────────┘
       ↓
┌─────────────┐
│    Login    │ → Handles error with useEffectEvent
└─────────────┘   → Shows: "This magic link has expired..."
```

### Reset Password Implementation

**File:** `src/routes/auth/reset-password.tsx`

Similar pattern applied with key differences:

1. **Two query parameters:** `token` (valid) or `error` (invalid)
2. **State management:** Token stored in local state after validation
3. **Clear URL on error:** Both token and error removed from URL after processing

```tsx
const [token, setToken] = useState<string | undefined>(search.token);

const showErrorToast = useEffectEvent((errorCode: string) => {
  const message = getErrorMessage(errorCode);
  setError(message);
  toast.error(message, {
    duration: 6000,
    description: 'Please request a new password reset link.',
  });
  setToken(undefined); // Clear invalid token
});

useEffect(() => {
  if (search.error) {
    showErrorToast(search.error);
    router.navigate({
      to: '/auth/reset-password',
      search: { token: undefined, error: undefined },
      replace: true,
    });
    return;
  }

  if (search.token) {
    setToken(search.token);
  }
}, [search.error, search.token, router]);
```

### Error Messages Reference

| Error Code | User-Friendly Message |
|------------|----------------------|
| `INVALID_TOKEN` | This magic link has expired or is invalid. Please request a new one. |
| `EXPIRED_TOKEN` | This magic link has expired. Please request a new one. |
| `TOKEN_NOT_FOUND` | Invalid magic link. Please request a new one. |
| `INVALID_EMAIL` | The email address is invalid. Please try again. |
| `USER_NOT_FOUND` | No account found with this email address. |
| `INVALID_CREDENTIALS` | Invalid email or password. |

### Benefits

**User Experience:**
- ✅ Clear, actionable error messages
- ✅ 6-second toast duration (enough time to read)
- ✅ Description text guides next steps
- ✅ Clean URLs (error params removed after display)

**Code Quality:**
- ✅ Supports both error parameter patterns
- ✅ Uses `useEffectEvent` for stable callbacks
- ✅ Proper error handling with try/catch
- ✅ Type-safe with TanStack Router search validation

**Reliability:**
- ✅ Handles malformed redirect URLs gracefully
- ✅ Works with all Better Auth authentication flows
- ✅ Cleans up state after showing error
- ✅ Prevents error from persisting on page refresh

---

## Admin Route Error Handling

### Overview
Improved error handling strategy for admin routes, specifically focusing on the property management room editor route. The goal is to provide better UX while maintaining data integrity.

### Problem: useEffect for Error Handling

#### ❌ Previous Approach (Anti-pattern)

```tsx
// BAD: Using useEffect to handle errors and redirect
useEffect(() => {
  if (roomQuery.error) {
    console.error('Failed to load room:', roomQuery.error);
    toast.error('Failed to load room');
    navigate({ to: '/admin/property-management' });
  }
}, [roomQuery.error, navigate]);
```

**Issues:**
1. **Doesn't catch loader errors** - If the initial loader fails, the component never renders
2. **Bad UX on refetch errors** - Background refetch failure forcefully redirects and **loses all unsaved work**
3. **Misuse of useEffect** - Error handling should be declarative, not a side effect
4. **Race conditions** - Navigation during render can cause issues

### ✅ Better Approach: Error Boundaries + Smart Query Handling

#### 1. Loader Error Handling (Initial Load)

**File:** `src/routes/admin/property-management/$roomId.tsx`

```tsx
loader: async ({ params }) => {
  try {
    // Pre-fetch all data in parallel before component renders
    const [room, pricingRules, blockedPeriods] = await Promise.all([
      trpcClient.rooms.get.query({ id: params.roomId }),
      trpcClient.rooms.getPricingRules.query({ roomId: params.roomId }),
      trpcClient.rooms.getBlockedPeriods.query({ roomId: params.roomId }),
    ]);

    return { room, pricingRules, blockedPeriods };
  } catch (error) {
    // Let router handle the error via error boundary
    console.error('Failed to load room data:', error);
    throw error; // Router will catch and show DefaultCatchBoundary
  }
},
```

**Benefits:**
- Router automatically catches thrown errors
- Shows error UI via `DefaultCatchBoundary` component
- User sees proper error page with "Go Back" option
- No component rendering on error = cleaner code path

#### 2. Query Configuration (Refetch Errors)

```tsx
const roomQuery = useQuery({
  ...trpc.rooms.get.queryOptions({ id: roomId }),
  initialData: loaderData.room,
  retry: 1, // Only retry once on refetch failures
});
```

**Benefits:**
- Limits retry attempts to avoid excessive API calls
- Faster failure feedback to user
- Reduces server load on persistent errors

#### 3. Refetch Error Notification (Non-blocking)

```tsx
// Show error toast on refetch failures (don't redirect - user might be editing)
useEffect(() => {
  if (roomQuery.error) {
    console.error('Failed to refresh room data:', roomQuery.error);
    toast.error('Failed to refresh room data', {
      description: 'Using cached data. Changes can still be saved.',
      duration: 5000,
    });
  }
}, [roomQuery.error]);
```

**Benefits:**
- ✅ User stays on page (no data loss)
- ✅ Clear feedback about what happened
- ✅ Reassures user they can continue working
- ✅ Cached/stale data is still usable
- ✅ User can manually retry or save changes

### Error Handling Strategy by Layer

#### Layer 1: Loader (Initial Data Fetch)
```tsx
loader: async ({ params }) => {
  try {
    const data = await fetchData(params);
    return data;
  } catch (error) {
    console.error('Loader error:', error);
    throw error; // → Error Boundary catches this
  }
}
```
**Result:** User sees error page, can navigate back

#### Layer 2: Query Configuration (Background Updates)
```tsx
useQuery({
  ...queryOptions,
  retry: 1, // Limit retries
  // Don't use onError for navigation!
})
```
**Result:** Query error state available, UI shows stale data

#### Layer 3: useEffect (Error Notification)
```tsx
useEffect(() => {
  if (query.error) {
    toast.error('Refresh failed', {
      description: 'Using cached data. You can still save.'
    });
  }
}, [query.error]);
```
**Result:** User is informed but not blocked

#### Layer 4: Mutation Error Handling (User Actions)
```tsx
const mutation = useMutation({
  mutationFn: updateData,
  onError: (error) => {
    toast.error('Save failed', {
      description: error.message,
      action: {
        label: 'Retry',
        onClick: () => mutation.mutate(data)
      }
    });
  }
});
```
**Result:** User can retry failed actions

### Comparison Table

| Scenario | Old Approach | New Approach |
|----------|--------------|--------------|
| **Initial load fails** | Component renders, then redirects | Error boundary shows error page |
| **Refetch fails while editing** | Redirect → user loses work ❌ | Toast notification → user keeps working ✅ |
| **User experience** | Disruptive, confusing | Informative, non-blocking |
| **Error visibility** | Brief toast before redirect | Clear error page or persistent toast |
| **Code pattern** | useEffect side effect | Declarative error handling |

### When to Use Each Pattern

#### ✅ Use Error Boundaries (Loader throws)
- Initial page load failures
- Critical data that blocks rendering
- Invalid route parameters
- Authentication/authorization failures

#### ✅ Use Query Error State (No throw, no redirect)
- Background data refreshes
- Optional data fetching
- Real-time updates
- When user has unsaved work

#### ✅ Use Mutation onError (Action feedback)
- Form submissions
- CRUD operations
- User-initiated actions
- When retry is possible

#### ❌ Don't Use useEffect + navigate for Errors
- Causes bad UX (data loss)
- Doesn't catch loader errors
- Creates race conditions
- Hard to test and debug

### Best Practice Summary

> **Key Principle:** Errors during initial load should prevent rendering (throw → error boundary). Errors during updates should inform but not disrupt the user (toast → keep working).

1. **Loader errors** = throw → error boundary shows error page
2. **Query refetch errors** = show toast, keep stale data, don't redirect
3. **Mutation errors** = show toast with retry option
4. **Never redirect on refetch errors** if user might have unsaved work

---

## Related Files

### Scroll Restoration
- `src/components/scroll-restoration.tsx` - Global scroll restoration component
- `src/routes/__root.tsx` - Root layout integration

### Authentication
- `src/routes/auth/login.tsx` - Login page with error handling
- `src/routes/auth/signup.tsx` - Signup page (no error handling needed)
- `src/routes/auth/reset-password.tsx` - Password reset with token validation
- `src/lib/auth-client.ts` - Better Auth client configuration

### Admin Routes
- `src/routes/admin/property-management/$roomId.tsx` - Example implementation
- `src/components/default-catch-boundary.tsx` - Error boundary component
- `src/routes/__root.tsx` - Root error boundary configuration

---

## Testing Checklist

### Scroll Restoration
- [x] Navigate between static pages (terms, privacy, contact, cancellation)
- [x] Verify smooth scroll to top on navigation
- [x] Check room pages (Rose Room, Texas Room) scroll behavior
- [x] Confirm booking flow step transitions still work
- [x] Test "Back to Top" buttons on homepage
- [x] Verify Header logo click scrolls to top

### Authentication
- [x] Login with expired magic link → Shows user-friendly error
- [x] Signup → Sends email (no error handling on signup page)
- [x] Click expired signup verification link → Redirects to login with error
- [x] Reset password with invalid token → Shows user-friendly error
- [x] All errors clean up URL after displaying

### Admin Routes
- [x] Room edit page refetch fails → Shows toast, keeps working
- [x] Initial load fails → Shows error boundary
- [x] User editing form when refetch fails → No data loss

---

## Status

**All implementations:** ✅ **COMPLETE**

- ✅ Auth error handling fixed for all flows
- ✅ Admin route error handling improved
- ✅ User-friendly error messages throughout
- ✅ Type-safe implementations
- ✅ Well-documented

**Project is ready for production!** 🚀

---

*Last Updated: December 2024*
