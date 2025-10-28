# TanStack Query + Better Auth Integration

## Overview

This document explains the improved integration between TanStack Query and Better Auth for efficient session management and route protection in the Irishette app.

## Problem Statement

The original implementation had several issues:

1. **Bypassed TanStack Query**: Session was fetched in `__root.tsx` beforeLoad using `authClient.getSession()` directly, which:
   - Didn't leverage TanStack Query's caching
   - Caused unnecessary refetches
   - Created potential SSR hydration mismatches

2. **Route Protection Complexity**: Using `beforeLoad` for authentication checks made it harder to handle loading states and created redirect loops

3. **No Centralized Cache**: Each route potentially fetched session data independently

## Solution: Client-Side Session Management with TanStack Query

### Key Changes

#### 1. Removed Session Preloading from Root Route

**Before** (`__root.tsx`):
```typescript
beforeLoad: async () => {
  const { data: session } = await authClient.getSession();
  return {
    session: session ?? null,
  };
}
```

**After**: Keep root route clean - no session fetching

The root route should focus on shell rendering and not authentication logic.

#### 2. Updated Account Route Protection

**Before** (`/account/index.tsx`):
```typescript
beforeLoad: async ({ location, context }) => {
  const session = context.session;
  
  if (!session) {
    throw redirect({
      to: '/',
      search: {
        redirect: location.href,
      },
    });
  }
  
  return { session };
}
```

**After**:
```typescript
beforeLoad: async ({ location }) => {
  // Don't fetch session here - let the component handle it with useSession
  return { location };
}
```

#### 3. Component-Level Authentication

The `AccountPage` component now handles authentication:

```typescript
function AccountPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession(); // Uses TanStack Query under the hood
  
  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      console.log('[AccountPage] No session, redirecting to home');
      router.navigate({
        to: '/',
        search: {
          redirect: window.location.pathname,
        },
      });
    }
  }, [session, isPending, router]);
  
  // Handle loading state
  if (isPending) {
    return <LoadingSpinner />;
  }
  
  // Don't render if no session (redirect will handle navigation)
  if (!session) {
    return null;
  }
  
  // Rest of component...
}
```

## How Better Auth's `useSession` Works with TanStack Query

The `useSession` hook from Better Auth automatically:

1. **Uses TanStack Query internally** for caching and state management
2. **Provides `isPending` state** for loading indicators
3. **Automatically refetches** on window focus and network reconnect
4. **Shares cache** across all components using `useSession`
5. **Handles SSR/CSR hydration** properly

### Query Configuration

Better Auth's session query is configured with:
- **Query Key**: `['better-auth-session']`
- **Stale Time**: Configurable (default: 5 minutes)
- **Refetch on Window Focus**: Yes
- **Retry**: Yes (with exponential backoff)

## Benefits of This Approach

### 1. **Better Performance**
- Session data is cached and shared across components
- No unnecessary refetches
- Automatic background revalidation

### 2. **Improved UX**
- Proper loading states with `isPending`
- No flash of unauthenticated content
- Smooth redirects without blocking navigation

### 3. **Simpler Code**
- No need to pass session through context
- Consistent pattern across all protected routes
- Easier to test and maintain

### 4. **SSR-Friendly**
- No hydration mismatches
- Server renders correctly without session
- Client hydrates and fetches session

## Usage Pattern for Protected Routes

Follow this pattern for any route that requires authentication:

```typescript
// 1. Simple beforeLoad
export const Route = createFileRoute('/protected-route')({
  beforeLoad: async ({ location }) => {
    return { location };
  },
  component: ProtectedComponent,
});

// 2. Component with auth check
function ProtectedComponent() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  
  // Redirect effect
  useEffect(() => {
    if (!isPending && !session) {
      router.navigate({
        to: '/auth/login',
        search: { redirect: window.location.pathname },
      });
    }
  }, [session, isPending, router]);
  
  // Loading state
  if (isPending) {
    return <LoadingSpinner />;
  }
  
  // Guard
  if (!session) {
    return null;
  }
  
  // Authenticated content
  return <div>Protected content for {session.user.email}</div>;
}
```

## Data Fetching with Session

When fetching data that requires authentication:

```typescript
const {
  data: bookings,
  isLoading,
  isError,
} = useQuery(
  trpc.bookings.getMyBookings.queryOptions(
    {
      userId: session?.user?.id || '',
      limit: 10,
      offset: 0,
    },
    {
      retry: false,
      staleTime: 5 * 60 * 1000,
      enabled: !!session?.user?.id, // Only fetch when authenticated
    },
  ),
);
```

**Key points:**
- Use optional chaining: `session?.user?.id`
- Provide fallback values: `|| ''`
- Use `enabled` option: `enabled: !!session?.user?.id`

## Testing

### Manual Testing Checklist

- [ ] Visit `/account` while logged out → Redirects to home
- [ ] Visit `/account` while logged in → Shows account page
- [ ] Log out from account page → Redirects to home
- [ ] Refresh `/account` while logged in → Stays on page (no flash)
- [ ] Open `/account` in new tab while logged in → Works immediately
- [ ] Network offline then online → Session revalidates automatically

### Query Devtools

Use TanStack Query Devtools to inspect:
- Session query state
- Cache status
- Refetch behavior
- Loading states

## Future Improvements

1. **Optimistic Updates**: Update UI before server confirms
2. **Prefetching**: Prefetch user data on login
3. **Middleware**: Create reusable auth middleware for routes
4. **Query Keys**: Centralize query keys in constants file

## Related Files

- `/src/lib/auth-client.ts` - Auth client configuration
- `/src/lib/auth.ts` - Better Auth server setup
- `/src/routes/__root.tsx` - Root route (no auth logic)
- `/src/routes/account/index.tsx` - Example protected route
- `/src/routes/auth/login.tsx` - Login page with session check

## References

- [Better Auth Documentation](https://www.better-auth.com/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [TanStack Router Documentation](https://tanstack.com/router/latest)
- [Reference Implementation](https://github.com/daveyplate/better-auth-tanstack-starter)
