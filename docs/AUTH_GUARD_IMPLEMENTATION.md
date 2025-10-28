# Auth Guard Implementation Guide

## ✅ What Was Implemented

### 1. **Reusable Auth Guard Functions** (`src/lib/auth-guard.ts`)

Three helper functions for different auth scenarios:

#### `requireAuth(location)`
- **Use Case**: Routes that require authentication (user account pages)
- **Behavior**: Redirects to `/auth/login` with return URL if not authenticated
- **Returns**: Session object (guaranteed)

#### `requireAdmin(location)`
- **Use Case**: Admin-only routes
- **Behavior**: 
  - Redirects to `/auth/login` if not authenticated
  - Redirects to `/` if authenticated but not admin
- **Returns**: Session object with admin role (guaranteed)

#### `optionalAuth()`
- **Use Case**: Public pages that change based on auth status (homepage, etc.)
- **Behavior**: No redirect, just returns session or null
- **Returns**: Session object or null

---

## 📋 How to Use in Routes

### Protected Route Example (Requires Auth)

```typescript
// src/routes/account/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/lib/auth-guard';

export const Route = createFileRoute('/account/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAuth(location);
    return { session };
  },
  component: AccountPage,
});

function AccountPage() {
  // Get session from route context - guaranteed to exist!
  const { session } = Route.useRouteContext();
  
  // No need for auth checks - session is guaranteed
  console.log(session.user.email); // ✅ Always safe
}
```

### Admin-Only Route Example

```typescript
// src/routes/admin/property-management/$roomId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/auth-guard';

export const Route = createFileRoute('/admin/property-management/$roomId')({
  beforeLoad: async ({ location }) => {
    const session = await requireAdmin(location);
    return { session };
  },
  component: EditRoomPage,
});

function EditRoomPage() {
  const { session } = Route.useRouteContext();
  // session.user.role === 'admin' is guaranteed
}
```

### Optional Auth Example (Public Page)

```typescript
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { optionalAuth } from '@/lib/auth-guard';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await optionalAuth();
    return { session };
  },
  component: HomePage,
});

function HomePage() {
  const { session } = Route.useRouteContext();
  
  // Conditional content based on auth
  if (session) {
    return <div>Welcome back, {session.user.name}!</div>;
  }
  
  return <div>Welcome! Please log in.</div>;
}
```

---

## 🔄 Migration Checklist

For each protected route, follow these steps:

### ✅ Step 1: Update Imports
```diff
- import { useSession } from '@/lib/auth-client';
- import { Navigate } from '@tanstack/react-router';
+ import { requireAuth } from '@/lib/auth-guard';
```

### ✅ Step 2: Add beforeLoad
```diff
export const Route = createFileRoute('/your-route')({
  head: () => ({ /* ... */ }),
+ beforeLoad: async ({ location }) => {
+   const session = await requireAuth(location);
+   return { session };
+ },
  component: YourComponent,
});
```

### ✅ Step 3: Update Component
```diff
function YourComponent() {
- const { data: session, isPending } = useSession();
+ const { session } = Route.useRouteContext();

- if (isPending) return <LoadingSpinner />;
- if (!session) return <Navigate to="/auth/login" />;

  // Your component logic - session guaranteed to exist!
}
```

### ✅ Step 4: Update Queries (if applicable)
```diff
const { data } = useQuery(
  trpc.something.queryOptions({
-   userId: session?.user?.id || '',
+   userId: session.user.id, // No need for optional chaining!
  }, {
-   enabled: !!session?.user?.id, // No need for enabled flag!
    retry: false,
  })
);
```

---

## 📁 Routes to Update

### Priority 1: Already Updated ✅
- [x] `/account/` (index.tsx) - **DONE**

### Priority 2: Account Routes
- [ ] `/account/booking/$bookingId`
- [ ] Any other `/account/**` routes

### Priority 3: Admin Routes
- [ ] `/admin/property-management`
- [ ] `/admin/property-management/$roomId`
- [ ] `/admin/bookings`
- [ ] Any other `/admin/**` routes

### Priority 4: Optional Auth (Low Priority)
These can use `optionalAuth()` if they show different content for logged-in users:
- [ ] `/` (homepage)
- [ ] `/rooms/$slug`
- [ ] Any public pages with auth-specific content

---

## 🎯 Benefits Achieved

### Before (Component-Level Check)
```typescript
function AccountPage() {
  const { data: session, isPending } = useSession();
  
  if (isPending) {
    return <LoadingSpinner />; // ❌ Wasted render
  }
  
  if (!session) {
    return <Navigate to="/auth/login" />; // ❌ Flash of content
  }
  
  // Need optional chaining everywhere
  console.log(session?.user?.email); // ⚠️ TypeScript not sure
}
```

### After (Route-Level Check)
```typescript
function AccountPage() {
  const { session } = Route.useRouteContext();
  
  // Component only renders if authenticated!
  // No loading states, no redirects, no checks needed
  console.log(session.user.email); // ✅ TypeScript knows it exists
}
```

### Improvements
- ✅ **0 wasted renders** - Component only mounts if authenticated
- ✅ **No flash of content** - Redirect happens before component loads
- ✅ **Better TypeScript** - Session guaranteed to exist
- ✅ **Cleaner code** - No repetitive auth checks
- ✅ **Better UX** - Faster perceived performance
- ✅ **SSR ready** - Works with server-side rendering when you're ready

---

## 🔧 Troubleshooting

### Issue: "Property 'session' does not exist"
**Solution**: Use `Route.useRouteContext()` instead of `Route.useLoaderData()`

```typescript
// ✅ Correct
const { session } = Route.useRouteContext();

// ❌ Won't work
const { session } = Route.useLoaderData();
```

### Issue: Redirect loop
**Problem**: Your auth check might be misconfigured

**Solution**: Check that `/auth/login` route doesn't use `requireAuth()`:
```typescript
// auth/login route should NOT have requireAuth
export const Route = createFileRoute('/auth/login')({
  component: LoginPage, // No beforeLoad needed
});
```

### Issue: Session undefined in component
**Problem**: Forgot to return session in beforeLoad

**Solution**: Make sure you're returning the session:
```typescript
beforeLoad: async ({ location }) => {
  const session = await requireAuth(location);
  return { session }; // ← Don't forget this!
},
```

---

## 🚀 Next Steps

1. **Test the current `/account` route** - Verify it redirects when logged out
2. **Migrate other `/account/**` routes** - Use same pattern
3. **Migrate admin routes** - Use `requireAdmin()` instead
4. **Remove unused code** - Clean up old `useSession` imports
5. **Consider SSR** - When ready, this pattern works with SSR!

---

## 📚 Reference

- [TanStack Router - Authenticated Routes](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- [Better Auth - Session Management](https://www.better-auth.com/docs/concepts/session)
