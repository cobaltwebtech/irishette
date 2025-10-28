# Auth Check Utilities Guide

## Overview

Reusable authentication helper functions for TanStack Router `beforeLoad` middleware. These functions use server-side session checking with proper SSR support via `getServerSession()`.

## Available Functions

### 1. `requireAuth(location)` - Protected Routes

Requires user to be authenticated. Redirects to login if not authenticated.

**Use for:** Protected pages that require login (account, bookings, etc.)

**Example:**
```typescript
import { requireAuth } from '@/utils/auth-check';

export const Route = createFileRoute('/account/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAuth(location);
    return { session }; // Pass to component for SSR
  },
  component: AccountPage,
});

function AccountPage() {
  const routeContext = Route.useRouteContext();
  const serverSession = routeContext.session;
  const { data: clientSession } = useSession();
  
  // Use server session during SSR, client after hydration
  const session = clientSession ?? serverSession!;
  
  // ...rest of component
}
```

**Behavior:**
- ✅ Checks session server-side with cookies
- ✅ Redirects to `/auth/login?redirect=/your-path` if not authenticated
- ✅ Returns session data for use in component
- ✅ Prevents content flash on SSR

---

### 2. `requireAdmin(location)` - Admin-Only Routes

Requires user to be authenticated AND have admin role. Redirects to login if not authenticated, home if not admin.

**Use for:** Admin-only pages (admin dashboard, user management, etc.)

**Example:**
```typescript
import { requireAdmin } from '@/utils/auth-check';

export const Route = createFileRoute('/admin/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAdmin(location);
    return { session };
  },
  component: AdminPage,
});
```

**Behavior:**
- ✅ Checks authentication (redirects to login if needed)
- ✅ Checks admin role (redirects to home with error if not admin)
- ✅ Returns session data for admin user
- ✅ Prevents unauthorized access

---

### 3. `requireGuest(redirectTo?)` - Auth Pages Only

Prevents authenticated users from accessing auth pages (login, signup, forgot-password, etc.). Redirects logged-in users away.

**Use for:** Auth pages that should only be accessible when logged out

**Example:**
```typescript
import { requireGuest } from '@/utils/auth-check';

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || '/account',
  }),
  beforeLoad: async ({ search }) => {
    await requireGuest(search.redirect);
  },
  component: LoginPage,
});
```

**Behavior:**
- ✅ Checks if user is already logged in
- ✅ Redirects to `/account` (or custom path) if authenticated
- ✅ Allows access if not authenticated
- ✅ Clean UX (no flash of login form for logged-in users)

---

### 4. `optionalAuth()` - Mixed Content Pages

Returns session or null without redirecting. Useful for pages with different content for logged-in vs logged-out users.

**Use for:** Home page, public pages with personalized content

**Example:**
```typescript
import { optionalAuth } from '@/utils/auth-check';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await optionalAuth();
    return { session }; // Can be null
  },
  component: HomePage,
});

function HomePage() {
  const { session } = Route.useRouteContext();
  
  return (
    <div>
      {session ? (
        <p>Welcome back, {session.user.name}!</p>
      ) : (
        <p>Welcome! Please log in.</p>
      )}
    </div>
  );
}
```

**Behavior:**
- ✅ Returns session if authenticated
- ✅ Returns null if not authenticated
- ✅ Never redirects
- ✅ Perfect for conditional content

---

## Quick Reference Table

| Function | Auth Required | Admin Required | Redirects | Use Case |
|----------|--------------|----------------|-----------|----------|
| `requireAuth()` | ✅ Yes | ❌ No | → Login | Protected user pages |
| `requireAdmin()` | ✅ Yes | ✅ Yes | → Login or Home | Admin-only pages |
| `requireGuest()` | ❌ No (must be logged out) | ❌ No | → Account | Auth pages (login/signup) |
| `optionalAuth()` | ⚠️ Optional | ❌ No | Never | Public pages with personalization |

---

## Route Protection Patterns

### Pattern 1: Protected User Route
```typescript
export const Route = createFileRoute('/account/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAuth(location);
    return { session };
  },
});
```

### Pattern 2: Admin Route
```typescript
export const Route = createFileRoute('/admin/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAdmin(location);
    return { session };
  },
});
```

### Pattern 3: Auth Page (Login/Signup)
```typescript
export const Route = createFileRoute('/auth/login')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || '/account',
  }),
  beforeLoad: async ({ search }) => {
    await requireGuest(search.redirect);
  },
});
```

### Pattern 4: Public Page with Personalization
```typescript
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await optionalAuth();
    return { session };
  },
});
```

---

## Component Session Access Pattern

For routes that use `requireAuth()` or `requireAdmin()` and return session:

```typescript
function MyComponent() {
  // Get session from route context (from beforeLoad)
  const routeContext = Route.useRouteContext();
  const serverSession = routeContext.session;

  // Also get client-side session for reactive updates
  const { data: clientSession } = useSession();

  // Use server session during SSR, client session after hydration
  // biome-ignore lint/style/noNonNullAssertion: Session guaranteed by beforeLoad
  const session = clientSession ?? serverSession!;

  // Now use session safely
  return <div>Welcome, {session.user.name}!</div>;
}
```

**Why this pattern?**
- ✅ `serverSession` available during SSR (no crash)
- ✅ `clientSession` provides reactive updates after hydration
- ✅ Fallback ensures session is always available
- ✅ No TypeScript errors with non-null assertion (safe due to beforeLoad)

---

## Migration from Old Pattern

### Before (Manual checks):
```typescript
import { getServerSession } from '@/core/functions/auth-server';

beforeLoad: async ({ location }) => {
  const session = await getServerSession();
  if (!session) {
    throw redirect({ to: '/auth/login', search: { redirect: location.href } });
  }
  return { session };
}
```

### After (Reusable helper):
```typescript
import { requireAuth } from '@/utils/auth-check';

beforeLoad: async ({ location }) => {
  const session = await requireAuth(location);
  return { session };
}
```

**Benefits:**
- ✅ Less boilerplate
- ✅ Consistent behavior across routes
- ✅ Easier to maintain
- ✅ Better TypeScript inference

---

## Common Use Cases

### Booking Flow (Requires Auth)
```typescript
export const Route = createFileRoute('/booking')({
  beforeLoad: async ({ location }) => {
    const session = await requireAuth(location);
    return { session };
  },
});
```

### Admin Dashboard (Requires Admin)
```typescript
export const Route = createFileRoute('/admin/dashboard')({
  beforeLoad: async ({ location }) => {
    const session = await requireAdmin(location);
    return { session };
  },
});
```

### Login Page (Guests Only)
```typescript
export const Route = createFileRoute('/auth/login')({
  validateSearch: (search) => ({ redirect: search.redirect || '/account' }),
  beforeLoad: async ({ search }) => {
    await requireGuest(search.redirect);
  },
});
```

### Home Page (Everyone)
```typescript
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await optionalAuth();
    return { session };
  },
});
```

---

## Security Benefits

1. **Server-Side Validation**: All checks run on server with proper cookies
2. **No Content Flash**: Routes don't render before auth check
3. **SSR Compatible**: Works correctly with TanStack Start SSR
4. **Type Safe**: Full TypeScript support with proper return types
5. **Consistent**: Same pattern across all routes
6. **Reusable**: DRY principle - write once, use everywhere

---

## Files

- **Source**: `/src/utils/auth-check.ts`
- **Server Function**: `/src/core/functions/auth-server.ts`
- **Examples**: 
  - `/src/routes/account/index.tsx` (requireAuth)
  - `/src/routes/auth/login.tsx` (requireGuest)
  - `/src/routes/auth/signup.tsx` (requireGuest)

---

## TypeScript

All functions are fully typed with proper return types:

```typescript
// Returns session (guaranteed)
requireAuth(location): Promise<Session>

// Returns session (guaranteed, admin role)
requireAdmin(location): Promise<Session>

// Returns void (just redirects or allows)
requireGuest(redirectTo?: string): Promise<void>

// Returns session or null
optionalAuth(): Promise<Session | null>
```
